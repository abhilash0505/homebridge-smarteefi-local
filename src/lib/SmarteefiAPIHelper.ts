import { Logger } from "homebridge";
import { Config, Device } from "./Config";
import { parse } from 'node-html-parser';
import request from 'request';

import { SmarteefiLocalAPIHelper } from "./SmarteefiLocalAPIHelper";
import * as SmarteefiHelper from "./SmarteefiHelper";
export class SmarteefiAPIHelper {
    private constructor(config: Config, log: Logger) {
        this.userid = config.userid;
        this.password = config.password;
        this.apiHost = `https://www.smarteefi.com/site`;
        this.log = log;
        this.config = config;
        this.cookie = [];
        this.csrf = "";
    }

    private userid = "";
    private password = "";
    private apiHost = "";
    private log: Logger;
    private config: Config;
    private static _instance: SmarteefiAPIHelper;
    private cookie: string[];
    private csrf: string;
    private httpsAgent: unknown;

    public static Instance(config: Config, log: Logger) {
        const c = this._instance || (this._instance = new this(config, log));
        c.config = config;
        c.log = log;

        return c;
    }

    login(cb) {
        this.log.info(`Logging in to the server ${this.apiHost}...`);
        this._loginApiCall(this.apiHost + "/login", {}, (_body) => {
            if (!_body) {
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
            const ipAddress = ip[index];
            const isThisFan = isFan[index];

            this._apiCall(`${this.apiHost}/namesettings?serial=${deviceId}`, "GET", {}, (_body, err) => {
                if (err) {
                    this.log.error("Failed to get device details: " + deviceId);
                    cb([]);
                } else {
                    this.log.info(_body)
                    const body = parse(_body);
                    this.log.info(body.toString());
                    let devicesAvailable = true;
                    let counter = 0;

                    const module = body.querySelector(`#deviceconfig-name`);
                    const moduleName = module?.attributes['value'];

                    while (devicesAvailable) {
                        const device = body.querySelector(`#deviceconfig-switchnames-${counter}`);
                        if (device != null) {
                            this.log.info(`Discovered switch ${device.attributes['value']} in ${moduleName} Module`);
                            const dev = new Device(deviceId, counter, device.attributes['value'], ipAddress, isThisFan);
                            discoveredDevices.push(dev);
                            counter++;
                        } else {
                            //Logic from https://www.smarteefi.com/site/namesettings?serial=*
                            if(deviceId) {
                                if (deviceId.indexOf('ft41') === 0) {
                                    this.log.info(`Automatically Adding FAN in ${moduleName} Module`);
                                    const dev = new Device(deviceId, counter, `${moduleName} Fan`, ipAddress, true);
                                    discoveredDevices.push(dev);
                                    counter++;
                                }
                            }
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
        const localHelper: SmarteefiLocalAPIHelper = SmarteefiLocalAPIHelper.Instance(this.log);

        localHelper.setDeviceStatus(deviceId,
            switchmap,
            statusmap,
            isFan,
            ip);

        localHelper.setDeviceStatus(deviceId, switchmap, statusmap, isFan, ip);
    }

    async setSwitchStatus(deviceId: string, deviceIp: string, switchmap: number, statusmap: number, isFan: boolean, cb) {

        if (this.config.local === true){
            this.setSwitchStatusLocally(deviceId, switchmap, statusmap, deviceIp, isFan);
            return cb({
                result: 'success'
            });
        }

        const commandObj = { "DeviceStatus": { "serial": SmarteefiHelper.setCorrectDeviceID(deviceId), "switchmap": switchmap, "statusmap": statusmap } }
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
        this.log.debug(`Getting status for ${deviceId}...`);
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
                } catch (error) {
                    _this.log.error("Unable to parse body or HTML");
                }
                _this.log.debug(response2.statusCode)
                if (error2 || e || response2.statusCode >= 400 || title == "Login") {
                    _this.log.error("Unable to login. Please verify user id and password and restart homebridge.");
                    cb();
                } else {
                    _this.setCookie(response2);
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
