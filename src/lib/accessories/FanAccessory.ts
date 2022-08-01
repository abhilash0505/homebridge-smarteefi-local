import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { SmarteefiPlatform } from '../../platform';
import { Config, DeviceStatus, Status } from '../Config';
import { SmarteefiAPIHelper } from '../SmarteefiAPIHelper';
import * as SmarteefiHelper from '../SmarteefiHelper';
import { STRINGS, MAX_FAN_SPEED_UNIT, BASE_FAN_SPEED } from '../../constants';
import { BaseAccessory } from './BaseAccessory';

export class FanAccessory extends BaseAccessory {
    private switchStates = {
        On: this.platform.Characteristic.Active.INACTIVE
    };

    constructor(
        platform: SmarteefiPlatform,
        accessory: PlatformAccessory,
    ) {
        super(platform, accessory);

        if (this.accessoryService) {
            this.accessoryService.setCharacteristic(this.platform.Characteristic.Model, STRINGS.FAN);
        }

        this.platformService = this.platform.Service.Fanv2;
        this.setService();

        // each service must implement at-minimum the "required characteristics" for the given service type
        // see https://developers.homebridge.io/#/service/FanV2

        // register handlers for the On/Off Characteristic
        (this.service as Service).getCharacteristic(this.platform.Characteristic.Active)
            .onSet(this.setONOFFState.bind(this))
            .onGet(this.getONOFFState.bind(this));

        (this.service as Service).getCharacteristic(this.platform.Characteristic.RotationSpeed)
            .onGet(this.getSpeed.bind(this))
            .onSet(this.setSpeed.bind(this));
    }

    async getSpeed(): Promise<CharacteristicValue> {
        const switchmap = SmarteefiHelper.getSwitchMap(this.accessory.context.device.sequence);
        let statusmap = this.deviceStatus.getStatusMap(this.accessory.context.device.id)?.statusmap || 0;
        if (statusmap === -1) {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }

        return SmarteefiHelper.getSpeedFromStatusMap(statusmap, switchmap);
    }

    async setSpeed(value: CharacteristicValue) {
        const switchmap = Math.pow(2, this.accessory.context.device.sequence);
        const speed = SmarteefiHelper.getSpeedFromFloat(value);

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
        this.setSpeed(value as number * (100 / MAX_FAN_SPEED_UNIT));
    }

    async getONOFFState(): Promise<CharacteristicValue> {
        const switchmap = Math.pow(2, this.accessory.context.device.sequence);
        let statusmap = this.deviceStatus.getStatusMap(this.accessory.context.device.id)?.statusmap || 0;
        if (statusmap === -1) {
            throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
        }
        // statusmap &= switchmap;
        if (statusmap === 0 || statusmap === BASE_FAN_SPEED) {
            return this.platform.Characteristic.Active.INACTIVE
        } else {
            return this.platform.Characteristic.Active.ACTIVE
        }
    }
}
