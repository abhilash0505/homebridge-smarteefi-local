import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { SmarteefiDiscovery as SmarteefiDiscovery } from './lib/SmarteefiDiscovery';
import { SwitchAccessory } from './lib/accessories/SwitchAccessory';
import { FanAccessory } from './lib/accessories/FanAccessory';
import { Config, Device, DeviceStatus } from './lib/Config';
import { SmarteefiAPIHelper } from './lib/SmarteefiAPIHelper';
import { PLATFORM_NAME, PLUGIN_NAME } from './constants';
import * as SmarteefiHelper from './lib/SmarteefiHelper';


export class SmarteefiPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];
  public early = false;
  private refreshDelay = 60000;
  private deviceStatus: DeviceStatus = DeviceStatus.Instance();

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);
    this.refreshDelay = this.config.refreshDelay || 60000;

    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  discoverDevices() {

    if (!this.config.devices) return this.log.error("No devices configured. Please configure atleast one device.");
    // if (!this.config.client_id) return this.log.error("Client ID is not configured. Please check your config.json");
    // if (!this.config.secret) return this.log.error("Client Secret is not configured. Please check your config.json");
    // if (!this.config.region) return this.log.error("Region is not configured. Please check your config.json");
    // if (!this.config.deviceId) return this.log.error("IR Blaster device ID is not configured. Please check your config.json");

    this.log.info('Starting discovery...');
    const smarteefi: SmarteefiDiscovery = new SmarteefiDiscovery(this.log, this.api);
    this.discover(smarteefi, 0, this.config.devices.length);
  }

  discover(smarteefi, i, total) {
    smarteefi.start(this.api, this.config, i, (devices: Device[], index) => {
      //loop over the discovered devices and register each one if it has not already been registered
      for (const device of devices) {
        if (device) {
          const uuid = this.api.hap.uuid.generate(device.id + "" + device.sequence);

          // see if an accessory with the same uuid has already been registered and restored from
          // the cached devices we stored in the `configureAccessory` method above
          const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

          if (existingAccessory) {
            // the accessory already exists
            this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

            // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
            existingAccessory.context.device = device;
            this.api.updatePlatformAccessories([existingAccessory]);

            // create the accessory handler for the restored accessory
            // this is imported from `platformAccessory.ts`
            if (SwitchAccessory || FanAccessory) {
              if(device.isFan)
                new FanAccessory(this, existingAccessory);
              else
                new SwitchAccessory(this, existingAccessory);
            } else {
              this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
              this.log.warn(`Removing unsupported accessory '${existingAccessory.displayName}'...`);
            }

            // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
            // remove platform accessories when no longer present
            // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
            // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
          } else {

            if (SwitchAccessory || FanAccessory) {
              // the accessory does not yet exist, so we need to create it
              this.log.info('Adding new accessory:', device.name);

              // create a new accessory
              const accessory = new this.api.platformAccessory(device.name, uuid);

              // store a copy of the device object in the `accessory.context`
              // the `context` property can be used to store any data about the accessory you may need
              accessory.context.device = device;

              if(device.isFan)
                new FanAccessory(this, accessory);
              else
                new SwitchAccessory(this, accessory);

              this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            } else {
              this.log.warn(`Unsupported accessory '${device.name}'...`);
            }
          }
        }
      }

      i++;
      if (i < total) {
        this.discover(smarteefi, i, total);
      } else {
        if (index >= 0) {
          this.refreshStatus(this);
        }
        //throw new this.api.hap.HapStatusError(this.api.hap.HAPStatus.OPERATION_TIMED_OUT);
      }
    });
  }

  refreshStatus(_this, onetime = false) {
    const totalDevices = _this.config.devices.length;
    const _config = new Config(
      _this.config.userid, 
      _this.config.password, 
      _this.config.devices, 
      _this.config.local
    );
    const apiHelper = SmarteefiAPIHelper.Instance(_config, _this.log);
    let completedUpdated = 0;

    for (let x = 0; x < totalDevices; x++) {
      const deviceId = _this.config.devices[x].device;
      apiHelper.getSwitchStatus(deviceId, 255, function (body) {
        // _this.log.debug(JSON.stringify(body));
        if (body.result == "error") {
          _this.log.error(`Unable to get status for deviceId ${deviceId}. Reason: ${SmarteefiHelper.getReason(body.major_ecode)}`)
          _this.deviceStatus.setStatusMap(deviceId, -1, -1);
        } else {
          _this.deviceStatus.setStatusMap(deviceId, body.switchmap, body.statusmap);
          const totalSwitches = _this.accessories.length;
          for (let i = 0; i < totalSwitches; i++) {
            const acc = _this.accessories[i];
            if (acc.context.device.id == deviceId) {
              let svc = acc.getService(_this.Service.Switch);
              if(_this.config.devices[x].isFan)
                svc = acc.getService(_this.Service.FanV2);
              
              const status = _this.decodeStatus(acc.context.device.sequence, acc.context.device.id);
              svc?.updateCharacteristic(_this.Characteristic.On, status);
              _this.log.debug(`Status updated for '${acc.displayName}' to '${status == 0 ? "Off" : "On"}'`);
            }
          }
        }

        completedUpdated++;
        if (completedUpdated >= totalDevices) {
          _this.log.info("Status refreshed for " + deviceId);
          if (!onetime) {
            setTimeout(_this.refreshStatus, _this.refreshDelay, _this);
          }
        }
      });
    }
  }

  decodeStatus(sequence: number, deviceId: string) {
    return SmarteefiHelper.decodeStatus(sequence, deviceId, this.Characteristic, this.deviceStatus);
  }
}
