import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { SmarteefiDiscovery as SmarteefiDiscovery } from './lib/SmarteefiDiscovery';
import { SwitchAccessory } from './lib/accessories/SwitchAccessory';
import { Config, Device, DeviceStatus } from './lib/Config';
import { SmarteefiAPIHelper } from './lib/SmarteefiAPIHelper';

const PLATFORM_NAME = 'Smarteefi';
const PLUGIN_NAME = 'homebridge-smarteefi';
/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
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


    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {

    //if (!this.config.devices) return this.log.error("No devices configured. Please configure atleast one device.");
    //if (!this.config.client_id) return this.log.error("Client ID is not configured. Please check your config.json");
    //if (!this.config.secret) return this.log.error("Client Secret is not configured. Please check your config.json");
    //if (!this.config.region) return this.log.error("Region is not configured. Please check your config.json");
    //if (!this.config.deviceId) return this.log.error("IR Blaster device ID is not configured. Please check your config.json");

    this.log.info('Starting discovery...');
    const smarteefi: SmarteefiDiscovery = new SmarteefiDiscovery(this.log, this.api);
    this.discover(smarteefi, 0, this.config.devices.length);
  }

  discover(smarteefi, i, total) {
    smarteefi.start(this.api, this.config, i, (devices: Device[], index) => {

      this.log.debug(JSON.stringify(devices));
      //loop over the discovered devices and register each one if it has not already been registered
      for (const device of devices) {
        if (device) {

          // generate a unique id for the accessory this should be generated from
          // something globally unique, but constant, for example, the device serial
          // number or MAC address
          //device.ir_id = this.config.smartIR[index].deviceId;
          const Accessory = SwitchAccessory;
          const uuid = this.api.hap.uuid.generate(device.id + "" + device.sequence);

          // see if an accessory with the same uuid has already been registered and restored from
          // the cached devices we stored in the `configureAccessory` method above
          const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

          if (existingAccessory) {
            // the accessory already exists
            this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

            // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
            // existingAccessory.context.device = device;
            // this.api.updatePlatformAccessories([existingAccessory]);

            // create the accessory handler for the restored accessory
            // this is imported from `platformAccessory.ts`
            if (Accessory) {
              new Accessory(this, existingAccessory);
            } else {
              this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
              this.log.warn(`Removing unsupported accessory '${existingAccessory.displayName}'...`);
            }

            // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
            // remove platform accessories when no longer present
            // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
            // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
          } else {

            if (Accessory) {
              // the accessory does not yet exist, so we need to create it
              this.log.info('Adding new accessory:', device.name);

              // create a new accessory
              const accessory = new this.api.platformAccessory(device.name, uuid);

              // store a copy of the device object in the `accessory.context`
              // the `context` property can be used to store any data about the accessory you may need
              accessory.context.device = device;

              // create the accessory handler for the newly create accessory
              // this is imported from `platformAccessory.ts`
              new Accessory(this, accessory);
              // link the accessory to your platform
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
    const apiHelper = SmarteefiAPIHelper.Instance(new Config(_this.config.userid, _this.config.password, _this.config.devices), _this.log);
    let completedUpdated = 0;
    for (let x = 0; x < totalDevices; x++) {
      const deviceId = _this.config.devices[x];
      apiHelper.getSwitchStatus(deviceId, 255, function (body) {
        _this.log.debug(JSON.stringify(body));
        if (body.result == "error") {
          _this.log.error(`Unable to get status for deviceId ${deviceId}. Reason: ${_this.getReason(body.major_ecode)}`)
          _this.deviceStatus.setStatusMap(deviceId, -1, -1);
        } else {
          _this.deviceStatus.setStatusMap(deviceId, body.switchmap, body.statusmap);
          const totalSwitches = _this.accessories.length;
          for (let i = 0; i < totalSwitches; i++) {
            const acc = _this.accessories[i];
            if (acc.context.device.id == deviceId) {
              const svc = acc.getService(_this.Service.Switch);
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
    const switchmap = Math.pow(2, sequence);
    let statusmap = this.deviceStatus.getStatusMap(deviceId)?.statusmap || 0;
    statusmap &= switchmap;
    if (statusmap == 0) {
      return this.Characteristic.Active.INACTIVE
    } else {
      return this.Characteristic.Active.ACTIVE
    }
  }

  getReason(code) {
    switch (code) {
      case 6:
        return "Device offline";
      default:
        return "Unknown error: " + code;
    }
  }
}
