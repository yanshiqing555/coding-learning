// ================================================================
// Siemens HMI - Main Application Logic
// ================================================================

let ws = null;
let connected = false;
let autoReadTimer = null;
let dashAutoTimer = null;
let readData = [];
let writeHistory = [];
let alarms = [];
let widgetConfig = { start: 0, count: 6 };
let quickToggleAddr = 0;
const DBG = true;

// ---- Init ----
document.addEventListener("DOMContentLoaded", () => {
  initClock();
  initNavigation();
  initSettings();
  initRead();
  initWrite();
  initDashboard();
  initAlarms();
  connectWS();
});

// ---- WebSocket Connection ----
function connectWS() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(proto + "//" + location.host);

  ws.onopen = () => {
    log("WebSocket 已连接");
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      handleWSMessage(msg);
    } catch (err) {
      log("WS消息解析失败: " + err.message);
    }
  };

  ws.onclose = () => {
    setConnected(false);
    log("WebSocket 已断开");
    setTimeout(connectWS, 3000);
  };

  ws.onerror = (err) => {
    log("WebSocket 错误");
  };
}

function wsSend(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

// ---- Message Handler ----
function handleWSMessage(msg) {
  switch (msg.type) {
    case "status":
      setConnected(msg.connected);
      break;
    case "error":
      addAlarm("error", msg.msg);
      log("错误: " + msg.msg);
      break;
    case "plcData":
      handlePLCData(msg.data);
      break;
  }
}

// ---- Modbus Protocol (Client Side) ----
let pendingRead = null;

function handlePLCData(data) {
  if (!pendingRead) return;
  const { func, start, quantity, resolve } = pendingRead;
  pendingRead = null;

  const bytes = new Uint8Array(data);
  if (bytes.length < 8) {
    addAlarm("error", "响应数据不完整");
    return;
  }

  // Check exception
  if (bytes[7] >= 0x80) {
    const errCode = bytes[8];
    const errMsgs = {
      1: "非法功能码", 2: "非法数据地址", 3: "非法数据值",
      4: "从站故障", 5: "确认", 6: "从站忙", 8: "奇偶校验错误",
      10: "网关路径不可用", 11: "网关目标无响应"
    };
    const errMsg = errMsgs[errCode] || "未知错误(" + errCode + ")";
    addAlarm("error", "Modbus异常: " + errMsg);
    log("PLC异常: " + errMsg);
    if (resolve) resolve(null);
    return;
  }

  // Coils (func 1, 2)
  if (func === 1 || func === 2) {
    const byteCount = bytes[8];
    const result = [];
    for (let i = 0; i < quantity; i++) {
      const byteIdx = 9 + Math.floor(i / 8);
      const bitIdx = i % 8;
      result.push(byteIdx < bytes.length ? ((bytes[byteIdx] >> bitIdx) & 1) === 1 : false);
    }
    if (resolve) resolve(result);
    return;
  }

  // Registers (func 3, 4)
  if (func === 3 || func === 4) {
    const result = [];
    for (let i = 0; i < quantity; i++) {
      const idx = 9 + i * 2;
      if (idx + 1 < bytes.length) {
        result.push((bytes[idx] << 8) | bytes[idx + 1]);
      }
    }
    if (resolve) resolve(result);
    return;
  }

  // Write response (func 5, 6, 16)
  if (func === 5 || func === 6) {
    if (resolve) resolve(true);
    return;
  }
  if (func === 16) {
    if (resolve) resolve(true);
    return;
  }
}

function modbusRead(func, start, quantity) {
  return new Promise((resolve) => {
    if (!connected) {
      addAlarm("warn", "未连接到PLC");
      resolve(null);
      return;
    }
    pendingRead = { func, start, quantity, resolve };
    wsSend({ type: "read", func, start, quantity, unit: getUnit() });

    setTimeout(() => {
      if (pendingRead && pendingRead.resolve === resolve) {
        pendingRead = null;
        addAlarm("error", "读取超时");
        resolve(null);
      }
    }, 5000);
  });
}

function modbusWrite(func, start, values) {
  return new Promise((resolve) => {
    if (!connected) {
      addAlarm("warn", "未连接到PLC");
      resolve(false);
      return;
    }
    pendingRead = { func, start, quantity: values.length, resolve: (res) => {
      resolve(res !== null);
    }};
    wsSend({ type: "write", func, start, values, unit: getUnit() });

    setTimeout(() => {
      if (pendingRead && pendingRead.resolve === resolve) {
        pendingRead = null;
        addAlarm("error", "写入超时");
        resolve(false);
      }
    }, 5000);
  });
}

// ---- Helpers ----
function getUnit() {
  return parseInt(document.getElementById("plcUnit").value) || 1;
}

function setConnected(state) {
  connected = state;
  const dot = document.getElementById("statusDot");
  const txt = document.getElementById("statusText");
  if (state) {
    dot.className = "status-dot online";
    txt.textContent = "已连接";
    document.getElementById("sbConn").textContent = "● 已连接";
    document.getElementById("connectBtn").textContent = "已连接";
    document.getElementById("connectBtn").disabled = true;
    document.getElementById("disconnectBtn").disabled = false;
    document.getElementById("wPlcStatus").textContent = "ONLINE";
    document.getElementById("wPlcBar").className = "fill green";
    document.getElementById("wPlcBar").style.width = "100%";
  } else {
    dot.className = "status-dot";
    txt.textContent = "未连接";
    document.getElementById("sbConn").textContent = "● 未连接";
    document.getElementById("connectBtn").textContent = "连接";
    document.getElementById("connectBtn").disabled = false;
    document.getElementById("disconnectBtn").disabled = true;
    document.getElementById("wPlcStatus").textContent = "OFFLINE";
    document.getElementById("wPlcBar").className = "fill red";
    document.getElementById("wPlcBar").style.width = "0%";
    document.getElementById("sbPlc").textContent = "PLC: ---";
  }
}

// ---- Clock ----
function initClock() {
  function tick() {
    const now = new Date();
    document.getElementById("clock").textContent =
      now.toLocaleTimeString("zh-CN", { hour12: false });
  }
  tick();
  setInterval(tick, 1000);
}

// ---- Navigation ----
function initNavigation() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("page-" + btn.dataset.page).classList.add("active");
    });
  });
}

// ---- Settings / Connection ----
function initSettings() {
  document.getElementById("connectBtn").addEventListener("click", () => {
    const ip = document.getElementById("plcIp").value.trim();
    const port = parseInt(document.getElementById("plcPort").value) || 502;
    if (!ip) { addAlarm("error", "请输入PLC IP地址"); return; }
    wsSend({ type: "connect", ip, port });
    document.getElementById("sbPlc").textContent = "PLC: " + ip + ":" + port;
    log("正在连接 " + ip + ":" + port + "...");
  });

  document.getElementById("disconnectBtn").addEventListener("click", () => {
    wsSend({ type: "disconnect" });
    stopAutoRead();
    stopDashAuto();
  });

  document.getElementById("applyDwBtn").addEventListener("click", () => {
    widgetConfig.start = parseInt(document.getElementById("dwAddr").value) || 0;
    widgetConfig.count = parseInt(document.getElementById("dwQty").value) || 6;
    refreshDashboard();
  });

  document.getElementById("applyQtBtn").addEventListener("click", () => {
    quickToggleAddr = parseInt(document.getElementById("qtAddr").value) || 0;
    initQuickToggle();
  });
}

// ---- Read Page ----
function initRead() {
  document.getElementById("readBtn").addEventListener("click", doRead);

  document.getElementById("autoReadBtn").addEventListener("click", () => {
    const btn = document.getElementById("autoReadBtn");
    if (autoReadTimer) {
      stopAutoRead();
      btn.textContent = "自动读取";
      btn.className = "btn btn-outline";
    } else {
      const interval = parseInt(document.getElementById("rInterval").value) || 1000;
      autoReadTimer = setInterval(doRead, interval);
      btn.textContent = "停止";
      btn.className = "btn btn-red";
      log("自动读取已启动 间隔:" + interval + "ms");
    }
  });
}

function stopAutoRead() {
  if (autoReadTimer) { clearInterval(autoReadTimer); autoReadTimer = null; }
}

async function doRead() {
  const func = parseInt(document.getElementById("rFunc").value);
  const start = parseInt(document.getElementById("rAddr").value) || 0;
  const qty = parseInt(document.getElementById("rQty").value) || 10;

  if (!connected) { addAlarm("warn", "请先连接PLC"); return; }

  document.getElementById("rResultInfo").textContent = "读取中...";

  const result = await modbusRead(func, start, qty);
  if (result === null) {
    document.getElementById("rResultInfo").textContent = "读取失败";
    return;
  }

  document.getElementById("rResultInfo").textContent = "已读取 " + result.length + " 个值";
  document.getElementById("sbTime").textContent = "最后通讯: " + new Date().toLocaleTimeString();

  const tbody = document.getElementById("readBody");
  tbody.innerHTML = "";

  if (func === 1 || func === 2) {
    result.forEach((v, i) => {
      const addr = start + i;
      tbody.innerHTML += `<tr>
        <td class="addr">0x${addr.toString(16).padStart(4,"0")} (${addr})</td>
        <td class="val">${v ? "ON" : "OFF"}</td>
        <td class="hex">${v ? "0x01" : "0x00"}</td>
      </tr>`;
    });
  } else {
    result.forEach((v, i) => {
      const addr = start + i;
      tbody.innerHTML += `<tr>
        <td class="addr">0x${addr.toString(16).padStart(4,"0")} (${addr})</td>
        <td class="val">${v}</td>
        <td class="hex">0x${v.toString(16).padStart(4,"0").toUpperCase()}</td>
      </tr>`;
    });
  }
}

// ---- Write Page ----
function initWrite() {
  document.getElementById("writeBtn").addEventListener("click", doWrite);

  document.querySelectorAll("#quickCoil .qbtn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const coil = parseInt(btn.dataset.coil);
      const addr = parseInt(document.getElementById("wAddr").value) || 0;
      const current = btn.classList.contains("on");
      const ok = await modbusWrite(5, addr + coil, current ? [0] : [0xFF00]);
      if (ok) {
        btn.classList.toggle("on");
        btn.classList.toggle("off");
        btn.textContent = coil;
        addHistory("写线圈", addr + coil, current ? "OFF" : "ON", "成功");
      }
    });
  });
}

async function doWrite() {
  const func = parseInt(document.getElementById("wFunc").value);
  const addr = parseInt(document.getElementById("wAddr").value) || 0;
  const raw = document.getElementById("wValue").value.trim();

  let values;
  if (func === 5) {
    const v = (raw === "1" || raw.toLowerCase() === "true");
    values = v ? [0xFF00] : [0];
  } else {
    values = raw.split(/[,;\s]+/).map(s => {
      const n = parseInt(s.trim());
      return isNaN(n) ? 0 : n;
    });
    if (func === 6) values = [values[0] || 0];
  }

  const ok = await modbusWrite(func, addr, values);
  if (ok) {
    const displayVal = func === 5 ? (values[0] ? "ON" : "OFF") : values.join(",");
    addHistory("写入", addr, displayVal, "成功");
    log("写入成功 地址=" + addr + " 值=" + displayVal);
  } else {
    addHistory("写入", addr, raw, "失败");
  }
}

function addHistory(op, addr, val, status) {
  const now = new Date().toLocaleTimeString();
  const tbody = document.getElementById("writeHistory");
  const color = status === "成功" ? "var(--siemens-green)" : "var(--siemens-red)";
  tbody.innerHTML = `<tr>
    <td style="color:var(--text-secondary)">${now}</td>
    <td>${op}</td>
    <td class="addr">${addr}</td>
    <td class="val">${val}</td>
    <td style="color:${color};font-weight:600">${status}</td>
  </tr>` + tbody.innerHTML;
  if (tbody.children.length > 50) tbody.removeChild(tbody.lastChild);
}

// ---- Dashboard ----
function initDashboard() {
  document.getElementById("dashReadBtn").addEventListener("click", refreshDashboard);

  document.getElementById("dashAutoBtn").addEventListener("click", () => {
    const btn = document.getElementById("dashAutoBtn");
    if (dashAutoTimer) {
      stopDashAuto();
      btn.textContent = "自动刷新";
      btn.className = "btn btn-outline";
    } else {
      const interval = 2000;
      dashAutoTimer = setInterval(refreshDashboard, interval);
      btn.textContent = "停止";
      btn.className = "btn btn-red";
    }
  });

  refreshDashboard();
}

function stopDashAuto() {
  if (dashAutoTimer) { clearInterval(dashAutoTimer); dashAutoTimer = null; }
}

async function refreshDashboard() {
  const start = parseInt(document.getElementById("dashAddr").value) || widgetConfig.start;
  const count = parseInt(document.getElementById("dashQty").value) || widgetConfig.count;
  if (count > 20) count = 20;
  if (!connected) return;

  const result = await modbusRead(3, start, count);
  if (!result) return;

  const container = document.getElementById("dashWidgets");
  container.innerHTML = "";

  result.forEach((v, i) => {
    const addr = start + i;
    const pct = Math.min(100, Math.round((v / 65535) * 100));
    let barClass = "fill";
    if (pct > 80) barClass += " red";
    else if (pct > 50) barClass += " yellow";
    else barClass += " green";

    container.innerHTML += `<div class="widget">
      <div class="label">0x${addr.toString(16).padStart(4,"0")} (${addr})</div>
      <div class="value">${v}</div>
      <div class="unit">0x${v.toString(16).padStart(4,"0").toUpperCase()}</div>
      <div class="bar"><div class="${barClass}" style="width:${pct}%"></div></div>
    </div>`;
  });
}

function initQuickToggle() {
  const container = document.getElementById("quickToggle");
  container.innerHTML = "";
  for (let i = 0; i < 8; i++) {
    const btn = document.createElement("button");
    btn.className = "qbtn off";
    btn.textContent = i;
    btn.addEventListener("click", async () => {
      const addr = quickToggleAddr + i;
      const on = btn.classList.contains("on");
      const val = on ? 0 : 0xFF00;
      const ok = await modbusWrite(5, addr, [val]);
      if (ok) {
        btn.classList.toggle("on");
        btn.classList.toggle("off");
        log("线圈 " + addr + " -> " + (on ? "OFF" : "ON"));
      }
    });
    container.appendChild(btn);
  }
}

// ---- Alarms ----
function initAlarms() {
  document.getElementById("clearAlarms").addEventListener("click", () => {
    alarms = [];
    document.getElementById("alarmList").innerHTML = "";
  });
}

function addAlarm(level, msg) {
  const now = new Date();
  const time = now.toLocaleTimeString();
  alarms.unshift({ time, level, msg });
  if (alarms.length > 100) alarms.pop();

  const list = document.getElementById("alarmList");
  const tagMap = { error: "ERR", warn: "WARN", info: "INFO" };
  const tagClass = { error: "err", warn: "warn", info: "info" };

  if (level === "error") {
    // Clear "waiting" placeholder
    if (list.children.length === 1 && list.children[0].textContent.includes("等待")) {
      list.innerHTML = "";
    }
    list.innerHTML =
      `<div class="alarm-item ${level}">
        <span class="time">${time}</span>
        <span class="tag ${tagClass[level]}">${tagMap[level]}</span>
        <span class="msg">${msg}</span>
      </div>` + list.innerHTML;
  }
}

// ---- Logging ----
function log(msg) {
  const time = new Date().toLocaleTimeString();
  console.log("[" + time + "] " + msg);
}
