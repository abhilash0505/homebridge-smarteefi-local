import { PlatformAccessory, Service } from "homebridge";
import { SmarteefiPlatform } from "../../platform";
import { Config, DeviceStatus } from "../Config";
import { SmarteefiAPIHelper } from "../SmarteefiAPIHelper";
import { STRINGS } from "../../constants";

export class BaseAccessory {
    protected service: Service | undefined;
    protected apiHelper: SmarteefiAPIHelper;
    protected deviceStatus: DeviceStatus = DeviceStatus.Instance();
    protected accessoryService: Service;
    protected platformService: typeof Service.Fanv2 | typeof Service.Switch | undefined;
    constructor(
        protected platform: SmarteefiPlatform,
        protected accessory: PlatformAccessory
    ) {
        this.platform = platform;
        this.accessory = accessory;
        this.apiHelper = SmarteefiAPIHelper.Instance(new Config(platform.config.userid, platform.config.password, platform.config.devices, platform.config.local), platform.log);

        this.accessoryService = this.accessory.getService(this.platform.Service.AccessoryInformation) as Service;

        if (this.accessoryService) {
            this.accessoryService.setCharacteristic(this.platform.Characteristic.Manufacturer, STRINGS.BRAND);
            let uuid = accessory.context.device.id + '-' +Math.round(Math.random() * 100);
            this.accessoryService.setCharacteristic(this.platform.Characteristic.SerialNumber, uuid);
        }
    }

    setService() {
        if (this.platformService) {
            
            let service = this.accessory.getService(this.platformService);
            if (!service)
                service = this.accessory.addService(this.platformService);
            this.service = service;

            this.service.setCharacteristic(this.platform.Characteristic.Name, this.accessory.context.device.name);
        }
    }
}