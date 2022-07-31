import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { SmarteefiPlatform } from '../../platform';
import { Config, DeviceStatus } from '../Config';
import { SmarteefiAPIHelper } from '../SmarteefiAPIHelper';
import * as SmarteefiHelper from '../SmarteefiHelper';
import { STRINGS, MAX_FAN_SPEED_UNIT, BASE_FAN_SPEED } from '../../constants';

export class FanAccessory {
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
            accessoryService.setCharacteristic(this.platform.Characteristic.Model, STRINGS.FAN);
            accessoryService.setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.id);
        }

        const fanService = this.platform.Service.Fanv2;
        let service = this.accessory.getService(fanService);
        if (!service)
            service = this.accessory.addService(fanService);

        this.service = service;
        this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

        // each service must implement at-minimum the "required characteristics" for the given service type
        // see https://developers.homebridge.io/#/service/FanV2

        // register handlers for the On/Off Characteristic
        this.service.getCharacteristic(this.platform.Characteristic.Active)
            .onSet(this.setONOFFState.bind(this))
            .onGet(this.getONOFFState.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.CurrentFanState)
            .onGet(this.getState.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed)
            .onGet(this.getSpeed.bind(this))
            .onSet(this.setSpeed.bind(this));

    }

    async getState(): Promise<CharacteristicValue> {
        const switchmap = Math.pow(2, this.accessory.context.device.sequence);
        let statusmap = SmarteefiHelper.getSwitchStatusMap(this);
        if (statusmap === -1) {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }

        statusmap &= switchmap;
        if (statusmap === 0 || statusmap === BASE_FAN_SPEED) {
            return this.platform.Characteristic.CurrentFanState.INACTIVE;
        } else {
            return this.platform.Characteristic.CurrentFanState.BLOWING_AIR;
        }
    }

    async getSpeed(): Promise<CharacteristicValue> {
        const switchmap = Math.pow(2, this.accessory.context.device.sequence);
        let statusmap = this.deviceStatus.getStatusMap(this.accessory.context.device.id)?.statusmap || 0;
        if (statusmap === -1) {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
        statusmap &= switchmap;
        if (statusmap === 0 || statusmap === BASE_FAN_SPEED) {
            return 0;
        } else {
            if (statusmap > BASE_FAN_SPEED)
                statusmap -= BASE_FAN_SPEED;
            return ((statusmap) / MAX_FAN_SPEED_UNIT) * 100;
        }
    }

    async setSpeed(value: CharacteristicValue) {
        const switchmap = Math.pow(2, this.accessory.context.device.sequence);
        const speed = (Math.floor(Number(value) / (100 / MAX_FAN_SPEED_UNIT)) + BASE_FAN_SPEED);
        this.platform.log.debug(`Changing Fan To Speed: ${speed}`);

        this.apiHelper.setSwitchStatus(
            this.accessory.context.device.id,
            this.accessory.context.device.ip,
            switchmap,
            speed,
            this.accessory.context.device.isFan,
            (body) => {
                this.platform.log.debug(JSON.stringify(body))
                if (body.result != "success") {
                    this.platform.log.error(`Failed to change device status due to error ${body.msg}`);
                } else {
                    this.platform.log.info(`${this.accessory.displayName} is now ${(value as number) == 0 ? 'Off' : 'On'}`);
                    setImmediate(this.platform.refreshStatus, this.platform, true);
                }
            }
        );
    }

    async setONOFFState(value: CharacteristicValue) {
        const switchmap = Math.pow(2, this.accessory.context.device.sequence);
        let statusmap = this.deviceStatus.getStatusMap(this.accessory.context.device.id)?.statusmap || 0;
        if (this.switchStates.On == (value as number)) {
            statusmap &= ~switchmap;
        } else {
            statusmap |= switchmap;
        }

        this.apiHelper.setSwitchStatus(
            this.accessory.context.device.id,
            this.accessory.context.device.ip,
            switchmap,
            statusmap,
            this.accessory.context.device.isFan,
            (body) => {
                this.platform.log.debug(JSON.stringify(body))
                if (body.result != "success") {
                    this.platform.log.error(`Failed to change device status due to error ${body.msg}`);
                } else {
                    this.platform.log.info(`${this.accessory.displayName} is now ${(value as number) == 0 ? 'Off' : 'On'}`);
                    setImmediate(this.platform.refreshStatus, this.platform, true);
                }
            }
        );
    }

    async setState(value: CharacteristicValue) {
        const switchmap = Math.pow(2, this.accessory.context.device.sequence);
        let statusmap = this.deviceStatus.getStatusMap(this.accessory.context.device.id)?.statusmap || 0;
        if (this.switchStates.On == (value as number)) {
            statusmap &= ~switchmap;
        } else {
            statusmap |= switchmap;
        }

        this.apiHelper.setSwitchStatus(
            this.accessory.context.device.id,
            this.accessory.context.device.ip,
            switchmap,
            statusmap,
            this.accessory.context.device.isFan,
            (body) => {
                this.platform.log.debug(JSON.stringify(body))
                if (body.result != "success") {
                    this.platform.log.error(`Failed to change device status due to error ${body.msg}`);
                } else {
                    this.platform.log.info(`${this.accessory.displayName} is now ${(value as number) == 0 ? 'Off' : 'On'}`);
                    setImmediate(this.platform.refreshStatus, this.platform, true);
                }
            }
        );

    }

    async getONOFFState(): Promise<CharacteristicValue> {
        const switchmap = Math.pow(2, this.accessory.context.device.sequence);
        let statusmap = this.deviceStatus.getStatusMap(this.accessory.context.device.id)?.statusmap || 0;
        if (statusmap === -1) {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
        statusmap &= switchmap;
        if (statusmap === 0 || statusmap === BASE_FAN_SPEED) {
            return this.platform.Characteristic.Active.INACTIVE
        } else {
            return this.platform.Characteristic.Active.ACTIVE
        }
    }
}
