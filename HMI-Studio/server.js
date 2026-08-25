// ================================================================
// HMI-Studio Server
// 威纶通风格 HMI 开发工具 - 后端服务
// 支持多协议、标签管理、画面设计、在线仿真
// ================================================================

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const crypto = require("crypto");
const { createDriver } = require("./protocols/drivers.js");

const PORT = 3001;
const PUBLIC = path.join(__dirname, "public");
const PROJECTS_DIR = path.join(__dirname, "projects");
const MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".png": "image/png",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
};

if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR);

// ---- 协议驱动管理 ----
let activeDrivers = {};

// ---- HTTP Server ----
const server = http.createServer((req, res) => {
    const uri = url.parse(req.url).pathname;
    const method = req.method;

    // ---- API 路由 ----
    if (uri.startsWith("/api/")) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        if (method === "OPTIONS") { res.writeHead(204); res.end(); return; }
        handleAPI(method, uri, req, res);
        return;
    }

    // ---- 静态文件 ----
    const filePath = uri === "/" ? path.join(PUBLIC, "index.html") : path.join(PUBLIC, uri);
    try {
        const data = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        res.end(data);
    } catch (e) {
        res.writeHead(404); res.end("Not Found");
    }
});

function handleAPI(method, uri, req, res) {
    const send = (code, data) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
    };

    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
        let params = {};
        try { if (body) params = JSON.parse(body); } catch(e) {}

        try {
            // ======== 设备连接管理 ========
            if (uri === "/api/device/connect" && method === "POST") {
                const id = params.id || "default";
                if (activeDrivers[id]) {
                    await activeDrivers[id].disconnect();
                }
                const driver = createDriver(params);
                await driver.connect();
                activeDrivers[id] = driver;
                send(200, { success: true, message: "已连接到 " + driver.name });
                return;
            }

            if (uri === "/api/device/disconnect" && method === "POST") {
                const id = params.id || "default";
                if (activeDrivers[id]) {
                    await activeDrivers[id].disconnect();
                    delete activeDrivers[id];
                }
                send(200, { success: true });
                return;
            }

            if (uri === "/api/device/status" && method === "GET") {
                const statuses = {};
                for (const [id, driver] of Object.entries(activeDrivers)) {
                    statuses[id] = { connected: driver.isConnected(), name: driver.name };
                }
                send(200, statuses);
                return;
            }

            if (uri === "/api/device/test" && method === "POST") {
                const driver = createDriver(params);
                try {
                    await driver.connect();
                    await driver.disconnect();
                    send(200, { success: true, message: params.ip + ":" + params.port + " 连接成功" });
                } catch (e) {
                    send(200, { success: false, message: e.message });
                }
                return;
            }

            // ======== 标签读写 ========
            if (uri === "/api/tag/read" && method === "POST") {
                const id = params.deviceId || "default";
                if (!activeDrivers[id]) return send(400, { error: "设备未连接" });
                if (!activeDrivers[id].isConnected()) return send(400, { error: "设备已断开" });
                const value = await activeDrivers[id].read(params.tag);
                send(200, { success: true, tag: params.tag, value });
                return;
            }

            if (uri === "/api/tag/write" && method === "POST") {
                const id = params.deviceId || "default";
                if (!activeDrivers[id]) return send(400, { error: "设备未连接" });
                if (!activeDrivers[id].isConnected()) return send(400, { error: "设备已断开" });
                await activeDrivers[id].write(params.tag, params.value);
                send(200, { success: true });
                return;
            }

            if (uri === "/api/tag/batch-read" && method === "POST") {
                const id = params.deviceId || "default";
                if (!activeDrivers[id]) return send(400, { error: "设备未连接" });
                const results = {};
                for (const tag of (params.tags || [])) {
                    try { results[tag] = await activeDrivers[id].read(tag); }
                    catch (e) { results[tag] = { error: e.message }; }
                }
                send(200, results);
                return;
            }

            // ======== 协议列表 ========
            if (uri === "/api/protocols" && method === "GET") {
                const { PROTOCOLS } = require("./protocols/drivers.js");
                const list = Object.entries(PROTOCOLS).map(([key, cls]) => ({
                    id: key, name: cls.prototype.name || key
                }));
                send(200, list);
                return;
            }

            // ======== 项目管理 ========
            if (uri === "/api/projects" && method === "GET") {
                const projects = [];
                if (fs.existsSync(PROJECTS_DIR)) {
                    fs.readdirSync(PROJECTS_DIR).forEach(f => {
                        if (f.endsWith(".json")) {
                            try {
                                const p = JSON.parse(fs.readFileSync(path.join(PROJECTS_DIR, f), "utf8"));
                                projects.push({ id: f, name: p.name || f, updated: p.updated });
                            } catch(e) {}
                        }
                    });
                }
                send(200, projects);
                return;
            }

            if (uri === "/api/project/save" && method === "POST") {
                if (!params.name) return send(400, { error: "项目名称不能为空" });
                params.updated = new Date().toISOString();
                const filename = params.name.replace(/[^a-zA-Z0-9_-]/g, "_") + ".json";
                fs.writeFileSync(path.join(PROJECTS_DIR, filename), JSON.stringify(params, null, 2), "utf8");
                send(200, { success: true, file: filename });
                return;
            }

            if (uri === "/api/project/load" && method === "POST") {
                const filepath = path.join(PROJECTS_DIR, params.file);
                if (!fs.existsSync(filepath)) return send(404, { error: "项目不存在" });
                const data = JSON.parse(fs.readFileSync(filepath, "utf8"));
                send(200, data);
                return;
            }

            send(404, { error: "未知API: " + method + " " + uri });
        } catch (e) {
            send(500, { error: e.message });
        }
    });
}

// ---- WebSocket (实时数据推送) ----
server.on("upgrade", (req, sock, head) => {
    const key = req.headers["sec-websocket-key"];
    const accept = crypto.createHash("sha1")
        .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
        .digest("base64");
    sock.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
    handleWS(sock);
});

let wsClients = [];
let monitorTimers = {};

function handleWS(sock) {
    wsClients.push(sock);
    let buf = Buffer.alloc(0);

    sock.on("data", (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        while (buf.length >= 2) {
            let len = buf[1] & 0x7F, offset = 2;
            if (len === 126) { len = (buf[2] << 8) | buf[3]; offset = 4; }
            const masked = (buf[1] & 0x80) !== 0;
            let maskKey = null;
            if (masked) { maskKey = buf.slice(offset, offset + 4); offset += 4; }
            if (buf.length < offset + len) break;
            let payload = buf.slice(offset, offset + len);
            if (masked) for (let i = 0; i < len; i++) payload[i] ^= maskKey[i % 4];
            if ((buf[0] & 0x0F) === 0x01) {
                try { handleWSMsg(JSON.parse(payload.toString("utf8")), sock); } catch(e) {}
            }
            buf = buf.slice(offset + len);
        }
    });

    sock.on("close", () => {
        wsClients = wsClients.filter(s => s !== sock);
        // Clean up monitor timers for this client
        for (const [id, timer] of Object.entries(monitorTimers)) {
            if (timer.client === sock) { clearInterval(timer.interval); delete monitorTimers[id]; }
        }
    });
}

function wsSend(sock, data) {
    const payload = Buffer.from(JSON.stringify(data), "utf8");
    const len = payload.length;
    let frame;
    if (len < 126) { frame = Buffer.alloc(2 + len); frame[0] = 0x81; frame[1] = len; payload.copy(frame, 2); }
    else { frame = Buffer.alloc(4 + len); frame[0] = 0x81; frame[1] = 126; frame[2] = (len >> 8) & 0xFF; frame[3] = len & 0xFF; payload.copy(frame, 4); }
    sock.write(frame);
}

function handleWSMsg(msg, sock) {
    switch (msg.type) {
        case "monitor-start":
            startMonitor(msg, sock);
            break;
        case "monitor-stop":
            stopMonitor(msg.id);
            break;
        case "read":
            handleReadWS(msg, sock);
            break;
        case "write":
            handleWriteWS(msg, sock);
            break;
    }
}

function startMonitor(msg, sock) {
    const id = msg.id || "monitor_" + Date.now();
    if (monitorTimers[id]) clearInterval(monitorTimers[id].interval);
    const interval = setInterval(async () => {
        const deviceId = msg.deviceId || "default";
        const driver = activeDrivers[deviceId];
        if (!driver || !driver.isConnected()) return;
        const results = {};
        for (const tag of (msg.tags || [])) {
            try { results[tag] = await driver.read(tag); } catch(e) { results[tag] = null; }
        }
        wsSend(sock, { type: "monitor-data", id, data: results, time: Date.now() });
    }, msg.interval || 500);
    monitorTimers[id] = { interval, client: sock, msg };
}

function stopMonitor(id) {
    if (monitorTimers[id]) { clearInterval(monitorTimers[id].interval); delete monitorTimers[id]; }
}

async function handleReadWS(msg, sock) {
    const driver = activeDrivers[msg.deviceId || "default"];
    if (!driver) { wsSend(sock, { type: "error", msg: "设备未连接" }); return; }
    try {
        const value = await driver.read(msg.tag);
        wsSend(sock, { type: "read-result", tag: msg.tag, value });
    } catch (e) {
        wsSend(sock, { type: "error", msg: e.message });
    }
}

async function handleWriteWS(msg, sock) {
    const driver = activeDrivers[msg.deviceId || "default"];
    if (!driver) { wsSend(sock, { type: "error", msg: "设备未连接" }); return; }
    try {
        await driver.write(msg.tag, msg.value);
        wsSend(sock, { type: "write-result", tag: msg.tag, value: msg.value, success: true });
    } catch (e) {
        wsSend(sock, { type: "error", msg: e.message });
    }
}

// ---- Start ----
server.listen(PORT, () => {
    console.log("================================================");
    console.log("  HMI-Studio Server v1.0");
    console.log("  工业 HMI 开发工具 (类似 EasyBuilder Pro)");
    console.log("  支持协议: Modbus TCP, Siemens S7, 更多扩展中");
    console.log("------------------------------------------------");
    console.log("  IDE 设计器: http://localhost:" + PORT);
    console.log("  在线仿真:  http://localhost:" + PORT + "/simulator.html");
    console.log("================================================");
});
