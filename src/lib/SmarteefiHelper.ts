import { Characteristic } from "homebridge";
import { DeviceStatus } from "./Config";

const getReason = (code) => {
  switch (code) {
    case 6:
      return "Device offline";
    default:
      return "Unknown error: " + code;
  }
};

const decodeStatus = (sequence: number, deviceId: string, characteristic: typeof Characteristic, deviceStatus: DeviceStatus) => {
  const switchmap = getSwitchMap(sequence);
  let statusmap = deviceStatus.getStatusMap(deviceId)?.statusmap || 0;
  statusmap &= switchmap;
  if (statusmap == 0) {
    return characteristic.Active.INACTIVE
  } else {
    return characteristic.Active.ACTIVE
  }
}

const getSwitchMap = (sequence: number) => {
  return Math.pow(2, sequence);
}


const getSwitchStatusMap = (_this) => {
  return _this.deviceStatus.getStatusMap(_this.accessory.context.device.id)?.statusmap || 0;
}

export {
  getReason,
  decodeStatus,
  getSwitchStatusMap,
  getSwitchMap
}