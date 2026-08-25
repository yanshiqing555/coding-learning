// ================================================================
// HMI-Studio 协议抽象层
// 统一接口，支持扩展多种工业协议
// ================================================================

class ProtocolDriver {
    constructor(config) {
        this.config = config || {};
        this.name = "base";
        this.connected = false;
    }

    async connect() { throw new Error("必须实现 connect()"); }
    async disconnect() { throw new Error("必须实现 disconnect()"); }
    async read(tag) { throw new Error("必须实现 read(tag)"); }
    async write(tag, value) { throw new Error("必须实现 write(tag, value)"); }
    isConnected() { return this.connected; }
}

// ==================== MODBUS TCP ====================
class ModbusTCPDriver extends ProtocolDriver {
    constructor(config) {
        super(config);
        this.name = "Modbus TCP";
        this.sock = null;
        this.tid = 0;
        this.pending = null;
        this.ip = config.ip || "192.168.0.1";
        this.port = config.port || 502;
        this.unit = config.unit || 1;
    }

    async connect() {
        const net = require("net");
        return new Promise((resolve, reject) => {
            this.sock = new net.Socket();
            this.sock.setTimeout(5000);
            this.sock.on("connect", () => { this.connected = true; resolve(); });
            this.sock.on("error", (e) => reject(e));
            this.sock.on("timeout", () => { this.sock.end(); reject(new Error("连接超时")); });
            this.sock.connect(this.port, this.ip);
        });
    }

    async disconnect() {
        if (this.sock) { this.sock.end(); this.sock = null; }
        this.connected = false;
    }

    async read(tag) {
        const { address, quantity, type } = this.parseTag(tag);
        const func = type === "coil" ? 1 : type === "input" ? 2 : type === "register" ? 3 : 4;
        const response = await this.sendRequest(func, address, quantity || 1);
        return this.decodeResponse(response, func, quantity || 1, type);
    }

    async write(tag, value) {
        const { address, type } = this.parseTag(tag);
        if (type === "coil") {
            return this.sendRequest(5, address, value ? 0xFF00 : 0x0000);
        } else {
            return this.sendRequest(6, address, value);
        }
    }

    parseTag(tag) {
        // tag格式: "M0.0", "D100", "40001"
        const parts = tag.match(/^([A-Za-z]+)(\d+)(?:\.(\d+))?$/);
        if (!parts) return { address: parseInt(tag) || 0, quantity: 1, type: "register" };
        const prefix = parts[1].toUpperCase();
        const addr = parseInt(parts[2]);
        const bit = parts[3] ? parseInt(parts[3]) : -1;
        let type = "register";
        let address = addr;
        if (prefix === "M" || prefix === "Y" || prefix === "Q" || prefix === "C") {
            type = "coil"; address = addr;
        } else if (prefix === "D" || prefix === "W" || prefix === "H" || prefix === "R") {
            type = "register"; address = addr;
        } else if (prefix.startsWith("4")) {
            type = "register"; address = parseInt(tag) - 40001;
        } else if (prefix.startsWith("3")) {
            type = "input"; address = parseInt(tag) - 30001;
        } else if (prefix.startsWith("0")) {
            type = "coil"; address = parseInt(tag) - 1;
        } else if (prefix.startsWith("1")) {
            type = "input"; address = parseInt(tag) - 10001;
        }
        return { address, quantity: 1, type, bit };
    }

    sendRequest(func, addr, data) {
        return new Promise((resolve, reject) => {
            if (!this.sock || !this.connected) return reject(new Error("未连接"));
            const pdu = Buffer.alloc(func <= 4 ? 5 : 5);
            pdu[0] = func;
            pdu[1] = (addr >> 8) & 0xFF; pdu[2] = addr & 0xFF;
            if (func <= 4) {
                pdu[3] = (data >> 8) & 0xFF; pdu[4] = data & 0xFF;
            } else {
                pdu[3] = (data >> 8) & 0xFF; pdu[4] = data & 0xFF;
            }
            const tid = ++this.tid;
            const mbap = Buffer.alloc(7 + pdu.length);
            mbap[0] = (tid >> 8) & 0xFF; mbap[1] = tid & 0xFF;
            mbap[2] = 0; mbap[3] = 0;
            mbap[4] = ((pdu.length + 1) >> 8) & 0xFF; mbap[5] = (pdu.length + 1) & 0xFF;
            mbap[6] = this.unit; pdu.copy(mbap, 7);

            this.pending = { tid, resolve, reject, func, addr };
            const timeout = setTimeout(() => {
                if (this.pending && this.pending.tid === tid) {
                    this.pending = null; reject(new Error("响应超时"));
                }
            }, 5000);
            this.pending._timeout = timeout;
            this.sock.once("data", (data) => this.onData(data));
            this.sock.write(mbap);
        });
    }

    onData(data) {
        if (!this.pending) return;
        clearTimeout(this.pending._timeout);
        const p = this.pending; this.pending = null;
        if (data.length < 8) return p.reject(new Error("响应不完整"));
        const func = data[7];
        if (func >= 0x80) return p.reject(new Error("Modbus异常: " + data[8]));
        p.resolve(data);
    }

    decodeResponse(response, func, quantity, type) {
        if (func === 1 || func === 2) {
            const result = [];
            for (let i = 0; i < quantity; i++)
                result.push(((response[9 + Math.floor(i / 8)] >> (i % 8)) & 1) === 1);
            return result;
        }
        const result = [];
        for (let i = 0; i < quantity; i++)
            result.push((response[9 + i * 2] << 8) | response[10 + i * 2]);
        return result;
    }
}

// ==================== Siemens S7 (ISO-on-TCP) ====================
class SiemensS7Driver extends ProtocolDriver {
    constructor(config) {
        super(config);
        this.name = "Siemens S7 (ISO-on-TCP)";
        this.sock = null;
        this.ip = config.ip || "192.168.0.1";
        this.port = config.port || 102;
        this.rack = config.rack || 0;
        this.slot = config.slot || 2;
    }

    async connect() {
        const net = require("net");
        return new Promise((resolve, reject) => {
            this.sock = new net.Socket();
            this.sock.setTimeout(10000);
            this.sock.on("connect", async () => {
                try {
                    await this.isoConnect();
                    this.connected = true;
                    resolve();
                } catch (e) { reject(e); }
            });
            this.sock.on("error", reject);
            this.sock.on("timeout", () => reject(new Error("连接超时")));
            this.sock.connect(this.port, this.ip);
        });
    }

    async disconnect() {
        if (this.sock) { try { this.sock.end(); } catch {} this.sock = null; }
        this.connected = false;
    }

    isoConnect() {
        return new Promise((resolve, reject) => {
            // ISO Connection Request (TSAP)
            const buf = Buffer.from([
                0x03, 0x00, 0x00, 0x16, 0x11, 0xE0, 0x00, 0x00,
                0x00, 0x01, 0x00, 0xC0, 0x01, 0x0A, 0xC1, 0x02,
                0x01, 0x00, 0xC2, 0x02, 0x01, 0x02
            ]);
            this.sock.once("data", (data) => {
                if (data.length > 20 && data[5] === 0xD0) resolve();
                else reject(new Error("ISO连接拒绝"));
            });
            this.sock.write(buf);
        });
    }

    async read(tag) {
        // S7 tag格式: "DB1.DBW0", "M0.0", "I0.0", "Q0.0"
        const parsed = this.parseS7Tag(tag);
        const req = this.buildS7ReadReq(parsed);
        this.sock.write(req);
        const resp = await this.readS7Resp();
        return this.decodeS7Data(resp, parsed);
    }

    async write(tag, value) {
        const parsed = this.parseS7Tag(tag);
        const req = this.buildS7WriteReq(parsed, value);
        this.sock.write(req);
        await this.readS7Resp();
        return true;
    }

    parseS7Tag(tag) {
        const m = tag.match(/^(DB(\d+)\.)?(DBW|DBD|DBX|M|I|Q|PI|PQ)(\d+)(?:\.(\d+))?$/i);
        if (!m) throw new Error("无效的S7地址: " + tag);
        let area, dbNum = 0, addr = parseInt(m[4]), bit = m[5] ? parseInt(m[5]) : -1;
        const type = m[3].toUpperCase();
        if (m[1]) dbNum = parseInt(m[2]);
        const areaMap = {
            "DBW": 0x84, "DBD": 0x84, "DBX": 0x84,
            "M": 0x83, "I": 0x81, "Q": 0x82,
            "PI": 0x85, "PQ": 0x86
        };
        area = areaMap[type] || 0x84;
        const size = (type === "DBD") ? 4 : (type === "DBX" || bit >= 0) ? 1 : 2;
        return { area, dbNum, addr, bit, size, tag };
    }

    buildS7ReadReq(parsed) {
        const buf = Buffer.alloc(35);
        buf[0] = 0x03; buf[1] = 0x00; buf[2] = 0x00; buf[3] = 0x1F;
        buf[4] = 0x02; buf[5] = 0xF0; buf[6] = 0x80;
        buf[7] = 0x32; buf[8] = 0x01; buf[9] = 0x00; buf[10] = 0x00;
        buf[11] = 0x00; buf[12] = 0x08; buf[13] = 0x00; buf[14] = 0x00;
        buf[15] = 0x0C; buf[16] = 0x00; buf[17] = 0x01; buf[18] = 0x12;
        buf[19] = 0x0A; buf[20] = 0x10; buf[21] = 0x02;
        buf[22] = parsed.size;       // 传输大小
        buf[23] = (parsed.addr >> 8) & 0xFF;
        buf[24] = parsed.addr & 0xFF;
        buf[25] = parsed.bit >= 0 ? parsed.bit : 0;
        buf[26] = 0x00;
        buf[27] = parsed.area;       // 区域
        if (parsed.area === 0x84) {
            buf[28] = (parsed.dbNum >> 8) & 0xFF;
            buf[29] = parsed.dbNum & 0xFF;
        } else { buf[28] = 0x00; buf[29] = 0x00; }
        buf[30] = 0x00; buf[31] = 0x00; buf[32] = 0x00;
        buf[33] = 0x00; buf[34] = 0x00;
        return buf;
    }

    buildS7WriteReq(parsed, value) {
        const buf = Buffer.alloc(35 + (parsed.size === 4 ? 4 : parsed.size === 1 ? 1 : 2));
        buf[0] = 0x03; buf[1] = 0x00; buf[2] = (buf.length - 7) >> 8; buf[3] = (buf.length - 7) & 0xFF;
        buf[4] = 0x02; buf[5] = 0xF0; buf[6] = 0x80;
        buf[7] = 0x32; buf[8] = 0x01; buf[9] = 0x00; buf[10] = 0x00;
        buf[11] = 0x00; buf[12] = 0x08; buf[13] = 0x00; buf[14] = 0x00;
        buf[15] = 0x0C; buf[16] = 0x00; buf[17] = 0x01; buf[18] = 0x12;
        buf[19] = 0x0A; buf[20] = 0x10; buf[21] = 0x02;
        buf[22] = parsed.size;
        buf[23] = (parsed.addr >> 8) & 0xFF; buf[24] = parsed.addr & 0xFF;
        buf[25] = parsed.bit >= 0 ? parsed.bit : 0; buf[26] = 0x00;
        buf[27] = parsed.area;
        buf[28] = (parsed.dbNum >> 8) & 0xFF; buf[29] = parsed.dbNum & 0xFF;
        // Value area
        buf[30] = 0x00; buf[31] = parsed.size === 4 ? 0x04 : parsed.size;
        const valOffset = 32;
        if (parsed.size === 4) { buf[valOffset] = (value >> 24) & 0xFF; buf[valOffset+1] = (value >> 16) & 0xFF; buf[valOffset+2] = (value >> 8) & 0xFF; buf[valOffset+3] = value & 0xFF; }
        else if (parsed.size === 1) buf[valOffset] = value ? 1 : 0;
        else { buf[valOffset] = (value >> 8) & 0xFF; buf[valOffset+1] = value & 0xFF; }
        return buf;
    }

    readS7Resp() {
        return new Promise((resolve, reject) => {
            let buf = Buffer.alloc(0);
            const onData = (data) => {
                buf = Buffer.concat([buf, data]);
                if (buf.length < 4) return;
                const len = (buf[2] << 8) | buf[3];
                if (buf.length >= len + 4) {
                    this.sock.removeListener("data", onData);
                    resolve(buf);
                }
            };
            this.sock.on("data", onData);
            setTimeout(() => { this.sock.removeListener("data", onData); reject(new Error("S7响应超时")); }, 5000);
        });
    }

    decodeS7Data(resp, parsed) {
        if (resp.length < 25) throw new Error("S7响应太短");
        const ret = resp[21];
        if (ret !== 0xFF) throw new Error("S7读取错误: " + ret);
        const dataStart = 25;
        if (parsed.size === 4) return (resp[dataStart] << 24 | resp[dataStart+1] << 16 | resp[dataStart+2] << 8 | resp[dataStart+3]);
        if (parsed.size === 1) return resp[dataStart];
        return (resp[dataStart] << 8 | resp[dataStart+1]);
    }
}

// ==================== 协议工厂 ====================
const PROTOCOLS = {
    "modbus-tcp": ModbusTCPDriver,
    "modbus-rtu": ModbusTCPDriver,  // 通过网关转换
    "siemens-s7": SiemensS7Driver,
    // "mitsubishi-mc": MitsubishiMCDriver,
    // "omron-fins": OmronFINSDriver,
    // "cclink": CCLinkDriver,
    // "profinet": PROFINETDriver,
    // "ethercat": EtherCATDriver,
};

function createDriver(config) {
    const DriverClass = PROTOCOLS[config.protocol];
    if (!DriverClass) throw new Error("不支持的协议: " + config.protocol);
    return new DriverClass(config);
}

// ---- 导出 ----
if (typeof module !== "undefined") {
    module.exports = { ProtocolDriver, ModbusTCPDriver, SiemensS7Driver, createDriver, PROTOCOLS };
}
