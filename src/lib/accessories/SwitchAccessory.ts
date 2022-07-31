import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { SmarteefiPlatform } from '../../platform';
import { Config, DeviceStatus } from '../Config';
import { SmarteefiAPIHelper } from '../SmarteefiAPIHelper';
import * as SmarteefiHelper from '../SmarteefiHelper';
import { STRINGS } from '../../constants';

export class SwitchAccessory {
    private service: Service;

    private switchStates = {
        On: this.platform.Characteristic.Active.INACTIVE
    };

    private apiHelper: SmarteefiAPIHelper;
    private deviceStatus: DeviceStatus = DeviceStatus.Instance();

    constructor(
        private readonly platform: SmarteefiPlatform,
        private readonly accessory: PlatformAccessory,
    ) {


        this.apiHelper = SmarteefiAPIHelper.Instance(new Config(platform.config.userid, platform.config.password, platform.config.devices, platform.config.local), platform.log);

        // set accessory information
        const accessoryService = this.accessory.getService(this.platform.Service.AccessoryInformation);

        if (accessoryService) {
            accessoryService.setCharacteristic(this.platform.Characteristic.Manufacturer, STRINGS.BRAND);
            accessoryService.setCharacteristic(this.platform.Characteristic.Model, STRINGS.SWITCH);
            accessoryService.setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.id);
        }

        const switchService = this.platform.Service.Switch;
        let service = this.accessory.getService(switchService);
        if (!service)
            service = this.accessory.addService(switchService);

        this.service = service;
        this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

        // each service must implement at-minimum the "required characteristics" for the given service type
        // see https://developers.homebridge.io/#/service/Lightbulb

        // register handlers for the On/Off Characteristic
        this.service.getCharacteristic(this.platform.Characteristic.On)
            .onSet(this.setOn.bind(this))                // SET - bind to the `setOn` method below
            .onGet(this.getOn.bind(this));               // GET - bind to the `getOn` method below

    }

    async setOn(value: CharacteristicValue) {
        const switchmap = Math.pow(2, this.accessory.context.device.sequence);
        let statusmap = SmarteefiHelper.getSwitchStatusMap(this);
        
        if (this.switchStates.On == (value as number)) {
            statusmap &= ~switchmap;
        } else {
            statusmap |= switchmap;
        }

        this.apiHelper.setSwitchStatus(
            this.accessory.context.device.id,
            this.accessory.context.device,
            switchmap,
            statusmap,
            false,
            (body) => {
                // this.platform.log.debug(JSON.stringify(body))
                if (body.result != "success") {
                    this.platform.log.error(`Failed to change device status due to error ${body.msg}`);
                } else {
                    this.platform.log.info(`${this.accessory.displayName} is now ${(value as number) == 0 ? 'Off' : 'On'}`);
                    setImmediate(this.platform.refreshStatus, this.platform, true);
                }
            });

    }

    async getOn(): Promise<CharacteristicValue> {
        const switchmap = Math.pow(2, this.accessory.context.device.sequence);

        let statusmap = SmarteefiHelper.getSwitchStatusMap(this);
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