import { Logger } from "homebridge";
import udp, { Socket } from 'dgram';

export class SmarteefiLocalAPIHelper {

    private static _instance: SmarteefiLocalAPIHelper;
    private log: Logger;

    public static Instance(logger: Logger) {
        const c = this._instance || (this._instance = new this(logger));
        return c;
    }

    private constructor(log: Logger) {
        this.log = log;
    }

    setDeviceStatus(deviceId: string, switchmap: number, statusmap: number, isFan: boolean, ip: string) {
        const deviceIdStr = this._getDeviceStrInHex(deviceId);

        if (!isFan) {
            const switchMapStr = this._prepareSwitchMapStatus(switchmap);
            const statusmapStr = this._prepareStatusMapStatus(statusmap);
            this._setSwitchStatus(ip, deviceIdStr, switchMapStr, statusmapStr);
        }
        else {
            const speed = this._getFanSpeed(statusmap);
            this._setFanStatus(ip, deviceIdStr, speed);
        }
    }

    _getFanSpeed(statusmap: number) {
        let speed = 0;

        if (statusmap === 1)
            speed = 1;
        else if (statusmap === 0)
            speed = 0;
        else
            speed = statusmap - 158;

        if (speed < 0)
            speed = 0;

        return speed;
    }

    _setSwitchStatus(ip: string, deviceIdStr: string, switchMapStr: string, statusmapStr: string) {
        let UDPMessage = `cc 10 10 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ${deviceIdStr} 00 00 00 00 00 00 00 00 00 00 00 00 ${switchMapStr} 00 00 00 ${statusmapStr} 00 00 00 00 00 00 00 00 00 00 00`;
        this._sendUDPCommand(ip, UDPMessage);
    }

    _setFanStatus(ip: string, deviceIdStr: string, speed: number) {
        let UDPMessage = `c0 12 20 00 e2 3b 0c 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ${deviceIdStr} 00 00 00 00 00 00 00 00 00 00 00 00 70 00 00 00 00 00 00 00 0${speed} 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00`;
        this._sendUDPCommand(ip, UDPMessage);
    }

    _prepareMessage(message: string) {
        let data = message;

        while (data.indexOf(' ') >= 0)
            data = data.replace(' ', '');

        return data;
    }

    _getDeviceStrInHex(deviceId: string) {
        return (Buffer.from(deviceId)).toString('hex');
    }

    _prepareSwitchMapStatus(switchmap) {
        return (switchmap > 10 ? (switchmap + "") : ("0" + switchmap));
    }

    _prepareStatusMapStatus(statusmap) {
        return (statusmap > 10 ? (statusmap + "") : ("0" + statusmap));
    }

    _sendUDPCommand(ip: string, message: string) {
        const data = Buffer.from(this._prepareMessage(message), 'hex');
        const _log = this.log;
        const client = udp.createSocket('udp4');
        client.send(data, 10201, ip, function (error) {
            if (error) {
                _log.debug("Oops!");
            } else {
                _log.debug(`Data sent to ${ip}`);
            }
        });
        client.on('message', function (msg, info) {
            _log.debug('Received %d bytes from %s:%d\n', msg.length, info.address, info.port);
            client.close();
        });
    }
} 