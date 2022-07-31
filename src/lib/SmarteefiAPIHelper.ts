import { Logger } from "homebridge";
import { Config, Device } from "./Config";
import { parse } from 'node-html-parser';
import request from 'request';

import udp, { Socket } from 'dgram';
import bufferfrom from 'buffer';
import { stat } from "fs";
import {msleep} from 'usleep';

export class SmarteefiAPIHelper {
    private constructor(config: Config, log: Logger) {
        this.userid = config.userid;
        this.password = config.password;
        this.apiHost = `https://www.smarteefi.com/site`;
        this.log = log;
        this.config = config;
        this.cookie = [];
        this.csrf = "";
        this.client = udp.createSocket('udp4');
    }

    private userid = "";
    private password = "";
    private apiHost = "";
    private log: Logger;
    private config: Config;
    private static _instance: SmarteefiAPIHelper;
    private cookie: string[];
    private csrf: string;
    private client: Socket;

    public static Instance(config: Config, log: Logger) {
        const c = this._instance || (this._instance = new this(config, log));
        c.config = config;
        c.log = log;

        return c;
    }

    login(cb) {
        this.log.info(`Logging in to the server ${this.apiHost}...`);
        this._loginApiCall(this.apiHost + "/login", {}, (_body) => {
            if(!_body) {
                this.log.warn("Unable to login. Retrying after 60 seconds...");
                setTimeout(() => {
                    this.login(cb);
                }, 60000);
            } else {
                cb(_body);
            }
        });
    }

    fetchDevices(devices: string[], ip: string[], isFan: boolean[], cb) {
        const discoveredDevices: Device[] = [];
        let completedDevices = 0;
        for (let index = 0; index < devices.length; index++) {
            const deviceId = devices[index];
            const ipAddress= ip[index];
            const isThisFan = isFan[index];

            this._apiCall(`${this.apiHost}/namesettings?serial=${deviceId}`, "GET", {}, (_body, err) => {
                if (err) {
                    this.log.error("Failed to get device details: " + deviceId);
                    cb([]);
                } else {
                    //this.log.info(_body)
                    const body = parse(_body);
                    // this.log.info(body.toString());
                    let devicesAvailable = true;
                    let counter = 0;

                    while (devicesAvailable) {
                        const device = body.querySelector(`#deviceconfig-switchnames-${counter}`);
                        if (device != null) {
                            this.log.info(`Discovered switch ${device.attributes['value']}`)
                            const dev = new Device(deviceId, counter, device.attributes['value'], ipAddress, isThisFan);
                            discoveredDevices.push(dev);
                            counter++;
                        } else {
                            this.log.info("No more devices..")
                            devicesAvailable = false;
                            break;
                        }
                    }
                }
                completedDevices++;
                if (completedDevices >= devices.length) {
                    cb(discoveredDevices);
                }
            });
        }
    }

    setSwitchStatusLocally(deviceId: string, switchmap: number, statusmap: number, ip: string, isFan: boolean) {
        const deviceIdStr = (Buffer.from(deviceId)).toString('hex');
        const switchMapStr = switchmap > 10 ? (switchmap + "") : ("0" + switchmap);
        const statusmapStr = statusmap > 10 ? (statusmap + "") : ("0" + statusmap);

        let UDPMessage = `cc 10 10 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ${deviceIdStr} 00 00 00 00 00 00 00 00 00 00 00 00 ${switchMapStr} 00 00 00 ${statusmapStr} 00 00 00 00 00 00 00 00 00 00 00`;

        if(isFan){
            
            let speed = 0;

            if( statusmap === 1)
                speed = 1;
            else if (statusmap === 0)
                speed = 0;
            else
                speed = statusmap - 158;

            if(speed < 0)
                speed = 1;

            UDPMessage = `c0 12 20 00 e2 3b 0c 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ${deviceIdStr} 00 00 00 00 00 00 00 00 00 00 00 00 70 00 00 00 00 00 00 00 0${speed} 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00`
            this.log.info(`FAN SPEED: ${speed}`);
        } 


        while(UDPMessage.indexOf(' ') >=0 )
        UDPMessage = UDPMessage.replace(' ','');
        this.log.info(UDPMessage);
        const data = Buffer.from(UDPMessage, 'hex');

        let _log = this.log;
        this.client.send(data, 10201, ip, function(error){
            if(error){
                _log.debug("Oops!");
            }else{
                _log.debug('Data sent !!!');
            }
        });

        this.client.on('message',function(msg,info){
            _log.debug('Data received from server : ' + msg.toString());
            _log.debug('Received %d bytes from %s:%d\n',msg.length, info.address, info.port);
          });
    }

    async setSwitchStatus(deviceId: string, deviceIp: string, switchmap: number, statusmap: number, isFan: boolean, cb) {
        
        //Would call the LAN UDP yet make an API call
        if(this.config.local === true)   
            this.setSwitchStatusLocally(deviceId, switchmap, statusmap, deviceIp, isFan);

        const commandObj = { "DeviceStatus": { "serial": deviceId, "switchmap": switchmap, "statusmap": statusmap } }
        const url = `${this.apiHost}/setstatus`;
        
        await this._apiCall(url, "PUT", commandObj, (_body, err) => {
            let body = {
                "result": "failure",
                "switchmap": 0,
                "statusmap": 0
            }
            if (!err) {
                try {
                    body = JSON.parse(_body);
                    // eslint-disable-next-line no-empty
                } catch (error) { }
            }
            cb(body);
        })
    }

    async getSwitchStatus(deviceId: string, switchmap: number, cb) {
        this.log.debug(`Getting switch status for ${deviceId}...`);
        const commandObj = { "DeviceStatus": { "serial": deviceId, "switchmap": switchmap } }

        const url = `${this.apiHost}/getstatus`;

        this.log.debug(JSON.stringify(commandObj));
        await this._apiCall(url, "PUT", commandObj, (_body, err) => {
            let body = {
                "result": "error",
                "switchmap": 0,
                "statusmap": 0
            }
            if (!err) {
                try {
                    body = JSON.parse(_body);
                    // eslint-disable-next-line no-empty
                } catch (error) { }
            }
            cb(body);
        })
    }

    _loginApiCall(endpoint: string, body: object, cb) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const _this = this;
        const options = {
            url: endpoint,
            forever: true
        };

        request.get(options, function (error, response, body) {
            if (error) {
                cb();
                return;
            }
            _this.log.debug("API call successful.");
            _this.setCookie(response);
            let b = parse("<p>Error</p>");
            try {
                b = parse(body);
            } catch (error) {
                _this.log.error("" + error, b);
                cb();
            }
            _this.csrf = "" + b?.querySelector("input[type=hidden]")?.attributes['value'];
            const _options = {
                url: endpoint,
                forever: true,
                'headers': {
                    'host': 'www.smarteefi.com',
                    'content-type': 'application/x-www-form-urlencoded',
                    'origin': 'https://www.smarteefi.com',
                    'cookie': `PHPSESSID=${_this.cookie['PHPSESSID']}; _csrf=${_this.cookie['_csrf']}`,
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15',
                    'accept-language': 'en-IN,en-GB;q=0.9,en;q=0.8'
                },
                form: {
                    '_csrf': _this.csrf,
                    'LoginForm[email]': _this.userid,
                    'LoginForm[password]': _this.password,
                    'LoginForm[rememberMe]': '1',
                    'login-button': ''
                }
            }

            request.post(_options, function (error2, response2, body2) {
                let e: string | undefined, title: string | undefined;
                try {
                    const b = parse(body2);
                    e = b?.querySelector(".site-error h1")?.innerHTML;
                    title = "" + b?.querySelector("title")?.innerHTML;
                    // eslint-disable-next-line no-empty
                } catch (error) {
                    _this.log.error("Unable to parse body or HTML");
                }
                _this.log.debug(response2.statusCode)
                if (error2 || e || response2.statusCode >= 400 || title == "Login") {
                    _this.log.error("Unable to login. Please verify user id and password and restart homebridge.");
                    cb();
                } else {
                    _this.setCookie(response2);
                    _this.log.debug(b.toString())
                    cb(b.toString() || { "status": "success" });
                }
            })
        })
            .on('error', (err) => {
                _this.log.error("API call failed.");
                _this.log.error(err);
                cb();
            })
    }
    async _apiCall(endpoint: string, method: string, body: object, cb) {
        this.log.debug(`Calling endpoint ${endpoint}`);
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const _this = this;
        //this._calculateSign(true, url.query, url.pathname, method, JSON.stringify(body));
        const options = method == "GET" ? {
            method: method,
            url: endpoint,
            forever: true,
            headers: {
                'cookie': `PHPSESSID=${_this.cookie['PHPSESSID']}; _csrf=${_this.cookie['_csrf']}`,
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15',
                'accept-language': 'en-IN,en-GB;q=0.9,en;q=0.8'
            }
        } : {
            method: method,
            url: endpoint,
            forever: true,
            headers: {
                'cookie': `PHPSESSID=${_this.cookie['PHPSESSID']}; _csrf=${_this.cookie['_csrf']}`,
                'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15',
                'accept-language': 'en-IN,en-GB;q=0.9,en;q=0.8',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body)
        };
        request(options, function (error, response, body) {
            // body is the decompressed response body
            _this.log.debug("API call successful.");
            cb(body, error);
        })
            .on('error', (err) => {
                _this.log.error("API call failed.");
                _this.log.error(err);
            })
    }

    setCookie(resp) {
        const x = ("" + resp.headers['set-cookie']).split(",");
        for (let i = 0; i < x.length; i++) {
            const mcookie = x[i].split(";");
            for (let j = 0; j < mcookie.length; j++) {
                const cookie = mcookie[j];
                const parts = cookie.match(/(.*?)=(.*)$/) || "";
                this.cookie[parts[1]?.trim()] = (parts[2] || '').trim();
            }
        }
    }
}
