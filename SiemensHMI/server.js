const http = require("http");
const fs = require("fs");
const path = require("path");
const net = require("net");
const crypto = require("crypto");

const PORT = 3001;
const PUBLIC = path.join(__dirname, "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

// ---- HTTP ----
const server = http.createServer((req, res) => {
  let uri = new URL(req.url, "http://localhost").pathname;
  if (uri === "/") uri = "/index.html";
  const file = path.join(PUBLIC, uri);
  try {
    const data = fs.readFileSync(file);
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end("Not Found");
  }
});

// ---- WebSocket ----
let plcSock = null;
let plcConnected = false;
let tid = 0;
let pending = null;

server.on("upgrade", (req, sock, head) => {
  const key = req.headers["sec-websocket-key"];
  const accept = crypto.createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");

  sock.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    "Sec-WebSocket-Accept: " + accept + "\r\n\r\n"
  );

  handleWS(sock);
});

function sendWS(sock, data) {
  const payload = Buffer.from(JSON.stringify(data), "utf8");
  const len = payload.length;
  let frame;
  if (len < 126) {
    frame = Buffer.alloc(2 + len);
    frame[0] = 0x81; frame[1] = len;
    payload.copy(frame, 2);
  } else {
    frame = Buffer.alloc(4 + len);
    frame[0] = 0x81; frame[1] = 126;
    frame[2] = (len >> 8) & 0xFF; frame[3] = len & 0xFF;
    payload.copy(frame, 4);
  }
  sock.write(frame);
}

function handleWS(sock) {
  let buf = Buffer.alloc(0);

  sock.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7F;
      let offset = 2;
      if (len === 126) { len = (buf[2] << 8) | buf[3]; offset = 4; }
      let maskKey = null;
      if (masked) { maskKey = buf.slice(offset, offset + 4); offset += 4; }
      if (buf.length < offset + len) break;
      let payload = buf.slice(offset, offset + len);
      if (masked) for (let i = 0; i < len; i++) payload[i] ^= maskKey[i % 4];
      const opcode = buf[0] & 0x0F;
      if (opcode === 0x08) { sock.end(); cleanup(); return; }
      if (opcode === 0x01) {
        try { handleMsg(JSON.parse(payload.toString("utf8")), sock); }
        catch (e) { sendWS(sock, { type: "error", msg: "Invalid JSON" }); }
      }
      buf = buf.slice(offset + len);
    }
  });

  sock.on("close", cleanup);
  sock.on("error", cleanup);
}

function cleanup() {
  if (plcSock) { plcSock.end(); plcSock = null; }
  plcConnected = false;
}

function handleMsg(msg, ws) {
  switch (msg.type) {
    case "connect":
      connectPLC(msg.ip, msg.port || 502, ws);
      break;
    case "disconnect":
      cleanup();
      sendWS(ws, { type: "status", connected: false });
      break;
    case "read":
      if (!plcConnected) {
        sendWS(ws, { type: "error", msg: "Not connected to PLC" });
        return;
      }
      doRead(msg, ws);
      break;
    case "write":
      if (!plcConnected) {
        sendWS(ws, { type: "error", msg: "Not connected to PLC" });
        return;
      }
      doWrite(msg, ws);
      break;
  }
}

function connectPLC(ip, port, ws) {
  cleanup();
  plcSock = new net.Socket();
  plcSock.setTimeout(5000);

  plcSock.on("connect", () => {
    plcConnected = true;
    sendWS(ws, { type: "status", connected: true });
  });

  plcSock.on("data", (data) => {
    const bytes = Array.from(data);
    if (pending) {
      const { resolve, start, qty, func } = pending;
      pending.resolve = null;
      // Forward raw data to client
      sendWS(ws, { type: "plcData", data: bytes });
    }
  });

  plcSock.on("close", () => {
    plcConnected = false;
    pending = null;
    sendWS(ws, { type: "status", connected: false });
  });

  plcSock.on("error", (err) => {
    plcConnected = false;
    sendWS(ws, { type: "error", msg: "连接失败: " + err.message });
  });

  plcSock.on("timeout", () => {
    plcSock.end();
    sendWS(ws, { type: "error", msg: "连接超时" });
  });

  plcSock.connect(port, ip);
}

function buildRequest(func, start, values, unit) {
  let pdu;
  if (func <= 4) {
    pdu = Buffer.alloc(5);
    pdu[0] = func;
    pdu[1] = (start >> 8) & 0xFF; pdu[2] = start & 0xFF;
    const qty = values || 1;
    pdu[3] = (qty >> 8) & 0xFF; pdu[4] = qty & 0xFF;
  } else if (func === 5 || func === 6) {
    pdu = Buffer.alloc(5);
    pdu[0] = func;
    pdu[1] = (start >> 8) & 0xFF; pdu[2] = start & 0xFF;
    const v = (values && values[0]) || 0;
    pdu[3] = (v >> 8) & 0xFF; pdu[4] = v & 0xFF;
  } else if (func === 16) {
    const vals = values || [0];
    pdu = Buffer.alloc(6 + vals.length * 2);
    pdu[0] = func;
    pdu[1] = (start >> 8) & 0xFF; pdu[2] = start & 0xFF;
    pdu[3] = (vals.length >> 8) & 0xFF; pdu[4] = vals.length & 0xFF;
    pdu[5] = vals.length * 2;
    for (let i = 0; i < vals.length; i++) {
      pdu[6 + i * 2] = (vals[i] >> 8) & 0xFF;
      pdu[7 + i * 2] = vals[i] & 0xFF;
    }
  }
  const tid2 = ++tid;
  const mbap = Buffer.alloc(7 + pdu.length);
  mbap[0] = (tid2 >> 8) & 0xFF; mbap[1] = tid2 & 0xFF;
  mbap[2] = 0; mbap[3] = 0;
  mbap[4] = ((pdu.length + 1) >> 8) & 0xFF;
  mbap[5] = (pdu.length + 1) & 0xFF;
  mbap[6] = unit || 1;
  pdu.copy(mbap, 7);
  return mbap;
}

function doRead(msg, ws) {
  pending = { func: msg.func, start: msg.start, qty: msg.quantity };
  const req = buildRequest(msg.func, msg.start, msg.quantity, msg.unit);
  plcSock.write(req);
}

function doWrite(msg, ws) {
  pending = { func: msg.func, start: msg.start };
  const req = buildRequest(msg.func, msg.start, msg.values, msg.unit);
  plcSock.write(req);
}

// ---- Start ----
server.listen(PORT, () => {
  console.log("=== Siemens HMI Server ===");
  console.log("Open: http://localhost:" + PORT);
  console.log("Ctrl+C to stop");
});

