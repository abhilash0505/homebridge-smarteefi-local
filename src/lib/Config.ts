export class Config {
    public userid = "";
    public password = "";
    public devices: string[] = [];
    public ip: string[] = [];
    public isFan: boolean[] = [];
    public local: boolean = false;
    constructor(userid?: string, password?: string, devices?: object[], local?: boolean) {
        this.userid = userid || "";
        this.password = password || "";
        this.devices = [];
        this.ip = [];
        this.isFan = [];
        
        devices?.forEach((device) => {
            this.devices.push(device["device"]);
            this.ip.push(device["ip"]);
            this.isFan.push(device["isFan"]);
        })
        
        this.local = local || false;
    }
}

export class Device {
    public id = "";
    public name = "Unknown";
    public sequence = 0;
    public ip = null;
    public isFan = false;
    constructor(id, sequence, name, ip, isFan) {
        this.id    = id;
        this.sequence = sequence;
        this.name   = name;
        this.ip = ip;
        this.isFan = isFan;
    }
}

export class IP {
    public id = "";
    public name = "Unknown";
    public sequence = 0;
    public ip = null;
    constructor(id, sequence, name) {
        this.id    = id;
        this.sequence = sequence;
        this.name   = name;
    }
}

export class Status {
    public id = "";
    public switchmap = 255;
    public statusmap = 0;
    constructor(id, switchmap, statusmap) {
        this.id = id;
        this.switchmap = switchmap;
        this.statusmap = statusmap;
    }
}

export class DeviceStatus {
    public statuses: Status[] = [];
    private static _instance: DeviceStatus;
  
    getStatusMap (id: string) {
        return this.statuses.find(value => {
            if(value.id == id) {
                return {swichmap: value.switchmap, statusmap: value.statusmap}
            }
        });
    }
    setStatusMap(id, switchmap, statusmap) {
        let x = this.statuses.find(value => {
            if(value.id == id) {
                return {swichmap: value.switchmap, statusmap: value.statusmap}
            }
        });
        if(!x) {
            x = new Status(id, switchmap, statusmap);
            this.statuses.push(x);
        } else {
            x.switchmap = switchmap;
            x.statusmap = statusmap;
        }
    }
    public static Instance() {
        const c = this._instance || (this._instance = new this());
        return c;
    }
}