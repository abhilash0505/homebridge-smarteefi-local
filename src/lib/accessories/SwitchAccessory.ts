import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { SmarteefiPlatform } from '../../platform';
import { Config, DeviceStatus } from '../Config';
import { SmarteefiAPIHelper } from '../SmarteefiAPIHelper';

/**
 * Generic Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class SwitchAccessory {
    private service: Service;

    /**
     * These are just used to create a working example
     * You should implement your own code to track the state of your accessory
     */
    private switchStates = {
        On: this.platform.Characteristic.Active.INACTIVE
    };

    private apiHelper: SmarteefiAPIHelper;
    private deviceStatus: DeviceStatus = DeviceStatus.Instance();

    constructor(
        private readonly platform: SmarteefiPlatform,
        private readonly accessory: PlatformAccessory,
    ) {
        this.apiHelper = SmarteefiAPIHelper.Instance(new Config(platform.config.userid, platform.config.password, platform.config.devices), platform.log);
        // set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)?.setCharacteristic(this.platform.Characteristic.Manufacturer, 'Smarteefi')?.setCharacteristic(this.platform.Characteristic.Model, 'Smart Switch')?.setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.id);

        // get the LightBulb service if it exists, otherwise create a new LightBulb service
        // you can create multiple services for each accessory
        this.service = this.accessory.getService(this.platform.Service.Switch) || this.accessory.addService(this.platform.Service.Switch);

        // set the service name, this is what is displayed as the default name on the Home app
        // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
        this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

        // each service must implement at-minimum the "required characteristics" for the given service type
        // see https://developers.homebridge.io/#/service/Lightbulb

        // register handlers for the On/Off Characteristic
        this.service.getCharacteristic(this.platform.Characteristic.On)
            .onSet(this.setOn.bind(this))                // SET - bind to the `setOn` method below
            .onGet(this.getOn.bind(this));               // GET - bind to the `getOn` method below

    }

    /**
     * Handle "SET" requests from HomeKit
     * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
     */
    async setOn(value: CharacteristicValue) {
        // implement your own code to turn your device on/off

        const switchmap = Math.pow(2, this.accessory.context.device.sequence);
        let statusmap = this.deviceStatus.getStatusMap(this.accessory.context.device.id)?.statusmap || 0;
        if (this.switchStates.On == (value as number)) {
            statusmap &= ~switchmap;
        } else {
            statusmap |= switchmap;
        }

        this.apiHelper.setSwitchStatus(this.accessory.context.device.id, switchmap, statusmap, (body) => {
            this.platform.log.debug(JSON.stringify(body))
            if (body.result != "success") {
                this.platform.log.error(`Failed to change device status due to error ${body.msg}`);
            } else {
                this.platform.log.info(`${this.accessory.displayName} is now ${(value as number) == 0 ? 'Off' : 'On'}`);
                setImmediate(this.platform.refreshStatus, this.platform, true);
            }
        });

    }

    /**
     * Handle the "GET" requests from HomeKit
     * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
     *
     * GET requests should return as fast as possbile. A long delay here will result in
     * HomeKit being unresponsive and a bad user experience in general.
     *
     * If your device takes time to respond you should update the status of your device
     * asynchronously instead using the `updateCharacteristic` method instead.
  
     * @example
     * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
     */
    async getOn(): Promise<CharacteristicValue> {
        const switchmap = Math.pow(2, this.accessory.context.device.sequence);
        let statusmap = this.deviceStatus.getStatusMap(this.accessory.context.device.id)?.statusmap || 0;
        if (statusmap == -1) {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
        statusmap &= switchmap;
        if (statusmap == 0) {
            return this.platform.Characteristic.Active.INACTIVE
        } else {
            return this.platform.Characteristic.Active.ACTIVE
        }
    }
}
