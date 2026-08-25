// ================================================================
// HMI-Studio IDE Core
// 画面设计器、标签管理、设备管理、拖拽交互
// ================================================================

let appState = {
    project: { name: "未命名项目", created: new Date().toISOString() },
    devices: [],
    tags: [],
    screens: [{ id: "SC1", name: "画面 1", width: 800, height: 480, bg: "#2a2a2a", widgets: [] }],
    currentScreen: "SC1",
    selectedWidget: null,
    nextId: { screen: 2, widget: 1, device: 1, tag: 1 },
    connected: false,
    monitorTimer: null
};

// ---- Init ----
document.addEventListener("DOMContentLoaded", () => {
    loadFromStorage();
    initDemoData();
    renderTagList();
    renderDeviceList();
    renderCanvas();
    renderProperties();
    updateStatusBar();
});

// ---- Tab Switching ----
function switchLeftTab(el, contentId) {
    document.querySelectorAll(".left-panel .tabs .tab").forEach(t => t.classList.remove("active"));
    el.classList.add("active");
    document.querySelectorAll(".left-panel .content").forEach(c => c.style.display = "none");
    document.getElementById(contentId).style.display = "block";
}

// ---- Dialog ----
function showDialog(name) {
    if (name === "tag") updateDeviceSelect("tgDevice");
    if (name === "widget") updateTagSelect("wgTag");
    document.getElementById("dlg" + name.charAt(0).toUpperCase() + name.slice(1)).classList.add("show");
}
function closeDialog(id) {
    document.getElementById(id).classList.remove("show");
}

// ==================== DEVICES ====================
function addDevice() {
    const device = {
        id: "DEV_" + appState.nextId.device++,
        name: document.getElementById("dvName").value,
        protocol: document.getElementById("dvProtocol").value,
        ip: document.getElementById("dvIp").value,
        port: parseInt(document.getElementById("dvPort").value) || 502,
        unit: document.getElementById("dvUnit").value,
        desc: document.getElementById("dvDesc").value
    };
    appState.devices.push(device);
    renderDeviceList();
    closeDialog("dlgDevice");
    saveToStorage();
    log("设备已添加: " + device.name + " (" + device.protocol + ")");
}

function removeDevice(id) {
    if (!confirm("确定删除此设备?")) return;
    appState.devices = appState.devices.filter(d => d.id !== id);
    renderDeviceList();
    saveToStorage();
}

function testDevice() {
    const btn = event.target;
    btn.textContent = "测试中..."; btn.disabled = true;
    const data = {
        protocol: document.getElementById("dvProtocol").value,
        ip: document.getElementById("dvIp").value,
        port: parseInt(document.getElementById("dvPort").value) || 502,
        unit: parseInt(document.getElementById("dvUnit").value) || 1
    };
    fetch("/api/device/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    }).then(r => r.json()).then(res => {
        alert(res.message || (res.success ? "连接成功" : "连接失败"));
        btn.textContent = "测试连接"; btn.disabled = false;
    }).catch(e => {
        alert("测试失败: " + e.message);
        btn.textContent = "测试连接"; btn.disabled = false;
    });
}

function renderDeviceList() {
    const el = document.getElementById("deviceItems");
    if (appState.devices.length === 0) {
        el.innerHTML = '<div style="color:var(--fg2);font-size:12px">暂无设备</div>';
        return;
    }
    el.innerHTML = appState.devices.map(d => `
        <div class="tree-item">
            <span class="icon">🔌</span>
            <span>${d.name}</span>
            <span style="font-size:11px;color:var(--fg2);margin-left:4px">${d.protocol}</span>
            <span class="del" onclick="removeDevice('${d.id}')">✕</span>
        </div>
    `).join("");
}

// ==================== TAGS ====================
function addTag() {
    const tag = {
        id: "TAG_" + appState.nextId.tag++,
        name: document.getElementById("tgName").value,
        deviceId: document.getElementById("tgDevice").value,
        type: document.getElementById("tgType").value,
        address: document.getElementById("tgAddr").value,
        initValue: document.getElementById("tgInit").value,
        desc: document.getElementById("tgDesc").value
    };
    appState.tags.push(tag);
    renderTagList();
    updateTagSelect("wgTag");
    closeDialog("dlgTag");
    saveToStorage();
    log("标签已添加: " + tag.name + " = " + tag.address);
}

function removeTag(id) {
    appState.tags = appState.tags.filter(t => t.id !== id);
    renderTagList();
    updateTagSelect("wgTag");
    saveToStorage();
}

function renderTagList() {
    const el = document.getElementById("tagItems");
    if (appState.tags.length === 0) {
        el.innerHTML = '<div style="color:var(--fg2);font-size:12px">暂无标签，点击工具栏添加</div>';
        return;
    }
    el.innerHTML = appState.tags.map(t => `
        <div class="item">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <span><strong>${t.name}</strong></span>
                <span class="tag-val" id="tv_${t.id}">---</span>
            </div>
            <div class="tag-addr">${t.address} (${t.type}) ${t.desc ? "- " + t.desc : ""}</div>
        </div>
    `).join("");
}

function updateDeviceSelect(elId) {
    const sel = document.getElementById(elId);
    sel.innerHTML = appState.devices.map(d =>
        `<option value="${d.id}">${d.name} (${d.protocol})</option>`
    ).join("");
    if (appState.devices.length === 0) sel.innerHTML = '<option value="">-- 先添加设备 --</option>';
}

function updateTagSelect(elId) {
    const sel = document.getElementById(elId);
    sel.innerHTML = appState.tags.map(t =>
        `<option value="${t.id}">${t.name} (${t.address})</option>`
    ).join("");
    if (appState.tags.length === 0) sel.innerHTML = '<option value="">-- 先添加标签 --</option>';
}

// ==================== SCREENS ====================
function addScreen() {
    const res = document.getElementById("scRes").value.split("x");
    const screen = {
        id: "SC" + appState.nextId.screen++,
        name: document.getElementById("scName").value,
        width: parseInt(res[0]), height: parseInt(res[1]),
        bg: document.getElementById("scBg").value,
        widgets: []
    };
    appState.screens.push(screen);
    appState.currentScreen = screen.id;
    renderCanvas();
    saveToStorage();
    closeDialog("dlgScreen");
    log("画面已添加: " + screen.name);
}

function renderCanvas() {
    const screen = appState.screens.find(s => s.id === appState.currentScreen);
    if (!screen) return;
    const canvas = document.getElementById("canvas");
    canvas.style.width = screen.width + "px";
    canvas.style.height = screen.height + "px";
    canvas.style.background = screen.bg;

    // Add a subtle grid
    const gridSize = 20;
    canvas.style.backgroundImage = `
        linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
    `;
    canvas.style.backgroundSize = gridSize + "px " + gridSize + "px";
    canvas.style.backgroundColor = screen.bg;

    canvas.innerHTML = "";
    screen.widgets.forEach(w => {
        const el = createWidgetElement(w);
        canvas.appendChild(el);
    });
    updateStatusBar();
}

function createWidgetElement(w) {
    const el = document.createElement("div");
    el.className = "widget w-" + w.type + (w.selected ? " selected" : "");
    el.style.left = w.x + "px";
    el.style.top = w.y + "px";
    el.style.width = w.w + "px";
    el.style.height = w.h + "px";
    el.dataset.wid = w.id;

    switch (w.type) {
        case "btn":
            el.style.background = "var(--blue)";
            el.style.color = "#fff";
            el.style.borderRadius = "4px";
            el.style.cursor = "pointer";
            el.textContent = w.text || "按钮";
            break;
        case "lamp":
            el.style.borderRadius = "50%";
            el.style.backgroundColor = w.val ? "var(--green)" : "var(--fg3)";
            break;
        case "display":
            el.style.background = "#1a1a1a";
            el.style.color = "var(--green)";
            el.style.fontFamily = "monospace";
            el.style.fontSize = "24px";
            el.style.border = "1px solid var(--border)";
            el.style.borderRadius = "4px";
            el.textContent = w.val !== undefined ? w.val : "----";
            break;
        case "meter":
            el.style.background = "var(--bg3)";
            el.style.borderRadius = "4px";
            el.style.overflow = "hidden";
            const fill = document.createElement("div");
            fill.className = "fill";
            fill.style.position = "absolute";
            fill.style.bottom = "0";
            fill.style.left = "0";
            fill.style.width = "100%";
            fill.style.height = (w.val || 0) + "%";
            fill.style.background = "var(--green)";
            fill.style.borderRadius = "0 0 4px 4px";
            fill.style.transition = "height 0.3s";
            el.appendChild(fill);
            const lbl = document.createElement("span");
            lbl.style.position = "relative";
            lbl.style.zIndex = "1";
            lbl.textContent = (w.val || 0) + "%";
            el.appendChild(lbl);
            break;
        case "switch":
            el.style.background = w.val ? "rgba(76,175,80,0.2)" : "var(--bg3)";
            el.style.border = "2px solid " + (w.val ? "var(--green)" : "var(--fg3)");
            el.style.borderRadius = "4px";
            el.style.cursor = "pointer";
            el.textContent = w.text || (w.val ? "ON" : "OFF");
            break;
        default:
            el.style.color = "var(--fg)";
            el.textContent = w.text || "元件";
    }

    el.addEventListener("click", (e) => {
        e.stopPropagation();
        selectWidget(w.id);
    });

    // Drag
    let drag = false, startX, startY, startL, startT;
    el.addEventListener("mousedown", (e) => {
        if (e.target !== el) return;
        drag = true;
        startX = e.clientX; startY = e.clientY;
        startL = w.x; startT = w.y;
        document.addEventListener("mousemove", onDrag);
        document.addEventListener("mouseup", function dragEnd() {
            drag = false;
            document.removeEventListener("mousemove", onDrag);
            document.removeEventListener("mouseup", dragEnd);
            if (w.x !== startL || w.y !== startT) saveToStorage();
        });
    });
    function onDrag(e) {
        if (!drag) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        // Snap to grid
        w.x = Math.round((startL + dx) / 10) * 10;
        w.y = Math.round((startT + dy) / 10) * 10;
        w.x = Math.max(0, Math.min(w.x, screen.width() ? 800 : 800 - w.w));
        w.y = Math.max(0, Math.min(w.y, 480 - w.h));
        el.style.left = w.x + "px";
        el.style.top = w.y + "px";
    }

    return el;
}

var canvasEl=document.getElementById("canvas");
canvasEl.addEventListener("contextmenu",function(e){showContextMenu(e,null);});

// Click on canvas to deselect

document.addEventListener("keydown",function(ke){
if(ke.target.tagName==="INPUT"||ke.target.tagName==="TEXTAREA"||ke.target.tagName==="SELECT")return;
var s=findWidget(appState.selectedWidget);if(!s)return;
if(ke.key==="Delete"||ke.key==="Backspace"){ke.preventDefault();removeWidget(appState.selectedWidget);}
if(ke.key==="Escape"){selectWidget(null);}
if(ke.ctrlKey&&ke.key==="d"){ke.preventDefault();duplicateWidget(appState.selectedWidget);}
var st=ke.shiftKey?10:1;
if(ke.key==="ArrowUp"){ke.preventDefault();s.y=Math.max(0,s.y-st);updWPos(s);}
if(ke.key==="ArrowDown"){ke.preventDefault();s.y=Math.min(480-s.h,s.y+st);updWPos(s);}
if(ke.key==="ArrowLeft"){ke.preventDefault();s.x=Math.max(0,s.x-st);updWPos(s);}
if(ke.key==="ArrowRight"){ke.preventDefault();s.x=Math.min(800-s.w,s.x+st);updWPos(s);}
});
function updWPos(w){var e=document.querySelector('.canvas .widget[data-wid="'+w.id+'"]');if(e){e.style.left=w.x+"px";e.style.top=w.y+"px";}renderProperties();saveToStorage();}

document.addEventListener("click", (e) => {
    if (e.target.classList.contains("canvas") || e.target.classList.contains("canvas-wrap")) {
        selectWidget(null);
    }
});

function selectWidget(widgetId) {
    if (appState.selectedWidget === widgetId) return;
    appState.selectedWidget = widgetId;
    // Update UI
    document.querySelectorAll(".canvas .widget").forEach(el => el.classList.remove("selected"));
    if (widgetId) {
        const el = document.querySelector(`.canvas .widget[data-wid="${widgetId}"]`);
        if (el) el.classList.add("selected");
    }
    renderProperties();
}

// ==================== WIDGETS ====================
function addWidget() {
    const type = document.getElementById("wgType").value;
    const tagId = document.getElementById("wgTag").value;
    const tag = appState.tags.find(t => t.id === tagId);
    const widget = {
        id: "W" + appState.nextId.widget++,
        type, tagId,
        x: 50, y: 50, w: 80, h: 40,
        text: document.getElementById("wgText").value || type,
        val: null
    };
    const screen = appState.screens.find(s => s.id === appState.currentScreen);
    if (screen) screen.widgets.push(widget);
    renderCanvas();
    selectWidget(widget.id);
    closeDialog("dlgWidget");
    saveToStorage();
    log("元件已添加: " + type);
}

function removeWidget(id) {
    const screen = appState.screens.find(s => s.id === appState.currentScreen);
    if (screen) {
        screen.widgets = screen.widgets.filter(w => w.id !== id);
        renderCanvas();
        selectWidget(null);
        saveToStorage();
    }
}

// ==================== PROPERTIES ====================
function renderProperties() {
    const panel = document.getElementById("propPanel");
    const widget = findWidget(appState.selectedWidget);
    if (!widget) {
        panel.innerHTML = '<div style="color:var(--fg2);font-size:12px;padding:20px;text-align:center">选择画面上的元件<br>查看和编辑属性</div>';
        return;
    }
    const tag = appState.tags.find(t => t.id === widget.tagId);
    panel.innerHTML = `
        <div class="section">
            <div class="sec-title">元件属性</div>
            <div class="prop-row"><label>类型</label><span>${widget.type}</span></div>
            <div class="prop-row"><label>ID</label><span style="font-size:11px;color:var(--fg2)">${widget.id}</span></div>
            <div class="prop-row"><label>文字</label><input value="${widget.text || ""}" onchange="updateWidgetProp('${widget.id}','text',this.value)"></div>
            <div class="prop-row"><label>X</label><input type="number" value="${widget.x}" onchange="updateWidgetProp('${widget.id}','x',parseInt(this.value)||0)"></div>
            <div class="prop-row"><label>Y</label><input type="number" value="${widget.y}" onchange="updateWidgetProp('${widget.id}','y',parseInt(this.value)||0)"></div>
            <div class="prop-row"><label>宽度</label><input type="number" value="${widget.w}" onchange="updateWidgetProp('${widget.id}','w',parseInt(this.value)||20)"></div>
            <div class="prop-row"><label>高度</label><input type="number" value="${widget.h}" onchange="updateWidgetProp('${widget.id}','h',parseInt(this.value)||20)"></div>
        </div>
        <div class="section">
            <div class="sec-title">绑定标签</div>
            <div class="prop-row"><label>标签</label><span>${tag ? tag.name + " (" + tag.address + ")" : "未绑定"}</span></div>
            <div class="prop-row"><label>当前值</label><span style="color:var(--green);font-family:monospace">${widget.val !== null && widget.val !== undefined ? widget.val : "---"}</span></div>
        </div>
        <div class="section">
            <button class="btn red" style="width:100%;padding:6px;border:none;border-radius:3px;cursor:pointer" onclick="removeWidget('${widget.id}')">删除元件</button>
            <button style="width:100%;padding:6px;border:1px solid var(--border);background:transparent;color:var(--fg2);border-radius:3px;cursor:pointer;margin-top:4px" onclick="selectWidget(null)">✕ 关闭属性面板</button>
        </div>
    `;
}

function updateWidgetProp(id, prop, value) {
    const screen = appState.screens.find(s => s.id === appState.currentScreen);
    if (!screen) return;
    const widget = screen.widgets.find(w => w.id === id);
    if (widget) {
        widget[prop] = value;
        renderCanvas();
        renderProperties();
        saveToStorage();
    }
}

function applyStyle(id,prop,val){var s=appState.screens.find(function(x){return x.id===appState.currentScreen;});if(!s)return;var w=s.widgets.find(function(x){return x.id===id;});if(w){w[prop]=val;renderCanvas();renderProperties();saveToStorage();}}
function findWidget(id) {
    if (!id) return null;
    for (const s of appState.screens) {
        const w = s.widgets.find(w => w.id === id);
        if (w) return w;
    }
    return null;
}

// ==================== MONITOR ====================
async function connectAllDevices() {
    for (const device of appState.devices) {
        try {
            const res = await fetch("/api/device/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: device.id,
                    protocol: device.protocol,
                    ip: device.ip,
                    port: device.port,
                    unit: parseInt(device.unit) || 1
                })
            });
            const data = await res.json();
            log(data.message);
        } catch (e) {
            log("连接失败: " + device.name + " - " + e.message);
        }
    }
    appState.connected = true;
    updateConnectionUI();
}

function startMonitor() {
    if (appState.devices.length === 0) {
        alert("请先添加设备");
        return;
    }
    connectAllDevices();
    if (appState.monitorTimer) clearInterval(appState.monitorTimer);
    appState.monitorTimer = setInterval(monitorTags, 1000);
    log("在线监控已启动");
}

function stopMonitor() {
    if (appState.monitorTimer) {
        clearInterval(appState.monitorTimer);
        appState.monitorTimer = null;
    }
    fetch("/api/device/disconnect", { method: "POST", headers: {"Content-Type":"application/json"}, body: "{}" });
    appState.connected = false;
    updateConnectionUI();
    log("监控已停止");
}

async function monitorTags() {
    for (const tag of appState.tags) {
        try {
            const res = await fetch("/api/tag/read", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ deviceId: tag.deviceId, tag: tag.address })
            });
            const data = await res.json();
            if (data.success) {
                tag.value = data.value;
                // Update UI
                const el = document.getElementById("tv_" + tag.id);
                if (el) el.textContent = Array.isArray(data.value) ? data.value.join(", ") : data.value;
                // Update widgets
                updateWidgetValues(tag.id, data.value);
            }
        } catch(e) {}
    }
}

function updateWidgetValues(tagId, value) {
    for (const s of appState.screens) {
        for (const w of s.widgets) {
            if (w.tagId === tagId) {
                w.val = Array.isArray(value) ? value[0] : value;
            }
        }
    }
    // Re-render only the widgets that changed
    const screen = appState.screens.find(s => s.id === appState.currentScreen);
    if (!screen) return;
    screen.widgets.forEach(w => {
        const el = document.querySelector(`.canvas .widget[data-wid="${w.id}"]`);
        if (!el) return;
        switch (w.type) {
            case "display": el.textContent = w.val !== null ? w.val : "----"; break;
            case "lamp": el.style.backgroundColor = w.val ? "var(--green)" : "var(--fg3)"; break;
            case "meter": {
                const fill = el.querySelector(".fill");
                if (fill) { fill.style.height = Math.min(100, Math.max(0, w.val || 0)) + "%"; }
                const lbl = el.querySelector("span");
                if (lbl) lbl.textContent = (w.val || 0) + "%";
                break;
            }
            case "switch":
                el.style.background = w.val ? "rgba(76,175,80,0.2)" : "var(--bg3)";
                el.style.borderColor = w.val ? "var(--green)" : "var(--fg3)";
                el.textContent = w.val ? "ON" : "OFF";
                break;
        }
    });
    renderProperties();
}

function updateConnectionUI() {
    const dot = document.getElementById("statusDot");
    const lbl = document.getElementById("statusLabel");
    if (appState.connected) {
        dot.className = "status-dot dot-on";
        lbl.textContent = "● 在线";
    } else {
        dot.className = "status-dot dot-off";
        lbl.textContent = "● 离线";
    }
}

// ==================== SIMULATION ====================
function simulateScreen() {
    const screen = appState.screens.find(s => s.id === appState.currentScreen);
    if (!screen) return;
    const w = window.open("", "simulator", "width=" + (screen.width + 20) + ",height=" + (screen.height + 60));
    if (!w) { alert("请允许弹出窗口"); return; }
    w.document.write(`
        <!DOCTYPE html><html><head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${screen.name} - 仿真</title>
        <style>
            * { margin:0; padding:0; box-sizing:border-box; }
            body { display:flex; align-items:center; justify-content:center; height:100vh; background:#111; }
            .screen {
                width:${screen.width}px; height:${screen.height}px;
                background:${screen.bg}; position:relative; overflow:hidden;
                box-shadow:0 0 30px rgba(0,0,0,0.5);
                background-image:
                    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
                background-size:20px 20px;
            }
    `);
    screen.widgets.forEach(w => {
        const tag = appState.tags.find(t => t.id === w.tagId);
        const wStyle = `position:absolute;left:${w.x}px;top:${w.y}px;width:${w.w}px;height:${w.h}px;overflow:hidden;`;
        switch (w.type) {
            case "btn":
                w.document.write(`<div style="${wStyle}background:#0099cc;color:#fff;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer">${w.text}</div>`);
                break;
            case "lamp":
                w.document.write(`<div style="${wStyle}border-radius:50%;background:${w.val ? '#4caf50' : '#6e6e6e'};box-shadow:${w.val ? '0 0 10px #4caf50' : 'none'}"></div>`);
                break;
            case "display":
                w.document.write(`<div style="${wStyle}background:#1a1a1a;color:#4caf50;font-family:monospace;font-size:24px;border:1px solid #3c3c3c;border-radius:4px;display:flex;align-items:center;justify-content:center">${w.val !== null ? w.val : '----'}</div>`);
                break;
            case "meter":
                w.document.write(`<div style="${wStyle}background:#2d2d30;border-radius:4px;position:relative"><div style="position:absolute;bottom:0;left:0;width:100%;height:${Math.min(100, Math.max(0, w.val || 0))}%;background:var(--green);border-radius:0 0 4px 4px;transition:height 0.3s"></div><span style="position:relative;z-index:1;display:flex;align-items:center;justify-content:center;height:100%">${w.val || 0}%</span></div>`);
                break;
            case "switch":
                w.document.write(`<div style="${wStyle}background:${w.val ? 'rgba(76,175,80,0.2)' : '#2d2d30'};border:2px solid ${w.val ? '#4caf50' : '#6e6e6e'};border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:14px">${w.val ? 'ON' : 'OFF'}</div>`);
                break;
            default:
                w.document.write(`<div style="${wStyle}color:#ccc;display:flex;align-items:center;justify-content:center;font-size:13px">${w.text}</div>`);
        }
    });
    w.document.write("</div></body></html>");
    w.document.close();
}

// ==================== PROJECT I/O ====================
function exportProject() {
    const data = JSON.stringify(appState, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = (appState.project.name || "project") + ".hmi.json";
    a.click();
    URL.revokeObjectURL(url);
    log("项目已导出");
}

function importProject(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.screens) {
                appState = data;
                renderTagList(); renderDeviceList(); renderCanvas(); renderProperties();
                saveToStorage();
                log("项目已导入: " + file.name);
            } else {
                alert("无效的项目文件");
            }
        } catch (e) { alert("导入失败: " + e.message); }
    };
    reader.readAsText(file);
}

// ==================== PERSISTENCE ====================
function saveToStorage() {
    try {
        localStorage.setItem("hmistudio_project", JSON.stringify(appState));
    } catch(e) {}
}

function loadFromStorage() {
    try {
        const data = localStorage.getItem("hmistudio_project");
        if (data) {
            const parsed = JSON.parse(data);
            if (parsed.screens) appState = parsed;
        }
    } catch(e) {}
}


function initDemoData() {
    if (appState.devices.length > 0 || appState.tags.length > 0) return;
    appState.devices.push({
        id: "DEV_1", name: "PLC1",
        protocol: "modbus-tcp", ip: "192.168.0.1",
        port: 502, unit: 1, desc: "主站PLC (示例)"
    });
    appState.devices.push({
        id: "DEV_2", name: "变频器1",
        protocol: "modbus-tcp", ip: "192.168.0.10",
        port: 502, unit: 2, desc: "驱动设备 (示例)"
    });
    appState.nextId.device = 3;
    var tagList = [
        { name: "运行状态", address: "M0", type: "bool", deviceId: "DEV_1", desc: "PLC运行" },
        { name: "故障报警", address: "M1", type: "bool", deviceId: "DEV_1", desc: "总报警" },
        { name: "设备温度", address: "D100", type: "word", deviceId: "DEV_1", desc: "℃" },
        { name: "设备压力", address: "D101", type: "word", deviceId: "DEV_1", desc: "MPa" },
        { name: "生产速度", address: "D200", type: "dword", deviceId: "DEV_1", desc: "mm/s" },
        { name: "产品计数", address: "D300", type: "dword", deviceId: "DEV_1", desc: "pcs" },
        { name: "电机电流", address: "D102", type: "word", deviceId: "DEV_1", desc: "A" },
        { name: "阀门状态", address: "M2", type: "bool", deviceId: "DEV_1" },
        { name: "设定温度", address: "D103", type: "word", deviceId: "DEV_1", desc: "℃" },
        { name: "运行时间", address: "D400", type: "dword", deviceId: "DEV_1", desc: "s" },
    ];
    tagList.forEach(function(t) {
        t.id = "TAG_" + (appState.nextId.tag++);
        appState.tags.push(t);
    });
    var scr = appState.screens[0];
    if (scr) {
        scr.widgets = [
            { id: "W1", type: "lamp", tagId: "TAG_2", x: 30, y: 30, w: 40, h: 40, text: "报警", val: null },
            { id: "W2", type: "display", tagId: "TAG_3", x: 30, y: 90, w: 120, h: 50, text: "温度", val: null },
            { id: "W3", type: "display", tagId: "TAG_4", x: 30, y: 160, w: 120, h: 50, text: "压力", val: null },
            { id: "W4", type: "meter", tagId: "TAG_7", x: 200, y: 30, w: 80, h: 140, text: "电流", val: null },
            { id: "W5", type: "btn", tagId: "TAG_1", x: 350, y: 30, w: 100, h: 40, text: "启动", val: null },
            { id: "W6", type: "switch", tagId: "TAG_8", x: 350, y: 90, w: 80, h: 36, text: "阀门", val: null },
        ];
        appState.nextId.widget = 7;
    }
    saveToStorage();
}


function showContextMenu(e,wid){
e.preventDefault();
var m=document.getElementById("ctxMenu");
if(!m){m=document.createElement("div");m.id="ctxMenu";m.style.cssText="position:fixed;background:#2d2d30;border:1px solid #3c3c3c;border-radius:6px;padding:4px;z-index:9999;min-width:160px;box-shadow:0 4px 16px rgba(0,0,0,0.4);display:none";document.body.appendChild(m);document.addEventListener("click",function(){m.style.display="none";});var mh=document.createElement('style');mh.textContent='.modal-header{padding:10px 16px;background:#094771;color:#fff;border-radius:8px 8px 0 0;font-size:14px;font-weight:600;cursor:move;user-select:none;margin:-20px -20px 12px -20px}';document.head.appendChild(mh);var cs=document.createElement('style');cs.textContent='.ctx-item{padding:6px 12px;cursor:pointer;font-size:12px;color:#ccc;border-radius:3px}.ctx-item:hover{background:#094771;color:#fff}.ctx-sep{height:1px;background:#3c3c3c;margin:4px 8px}';document.head.appendChild(cs);}
var s=appState.screens.find(function(x){return x.id===appState.currentScreen;});
var w=s?s.widgets.find(function(x){return x.id===wid;}):null;
var its=[];
if(w){
its.push({l:"编辑属性",a:function(){selectWidget(wid);}});
its.push({l:"复制元件",a:function(){duplicateWidget(wid);}});
its.push({l:"置于最前",a:function(){moveWidgetZ(wid,"front");}});
its.push({l:"置于最后",a:function(){moveWidgetZ(wid,"back");}});
its.push({t:"s"});
its.push({l:"删除元件",a:function(){removeWidget(wid);}});
}else{
its.push({l:"粘贴元件",a:function(){}});
}
m.innerHTML=its.map(function(x){return x.t==='s'?'<div class="ctx-sep"></div>':'<div class="ctx-item"><span>'+x.l+'</span></div>';}).join('');
m.style.display="block";m.style.left=Math.min(e.clientX,window.innerWidth-180)+"px";m.style.top=Math.min(e.clientY,window.innerHeight-its.length*35)+"px";
var ci=0;m.querySelectorAll(".ctx-item").forEach(function(el){var oi=ci++;el.addEventListener("click",function(ev){ev.stopPropagation();m.style.display="none";var f=its.filter(function(x){return x.t!=="s"});if(f[oi]&&f[oi].a)f[oi].a();});});
el.addEventListener("mouseover",function(){this.style.background="#094771";});
el.addEventListener("mouseout",function(){this.style.background="transparent";});
}
function duplicateWidget(id){
var s=appState.screens.find(function(x){return x.id===appState.currentScreen;});
if(!s)return;var src=s.widgets.find(function(x){return x.id===id;});if(!src)return;
var nw=JSON.parse(JSON.stringify(src));nw.id="W"+(appState.nextId.widget++);nw.x+=20;nw.y+=20;
if(nw.x+nw.w>800)nw.x=0;if(nw.y+nw.h>480)nw.y=0;
s.widgets.push(nw);renderCanvas();selectWidget(nw.id);saveToStorage();
}
function moveWidgetZ(id,p){
var s=appState.screens.find(function(x){return x.id===appState.currentScreen;});
if(!s)return;var idx=-1;for(var i=0;i<s.widgets.length;i++){if(s.widgets[i].id===id){idx=i;break;}}
if(idx<0)return;var w=s.widgets.splice(idx,1)[0];
if(p==="front")s.widgets.push(w);else s.widgets.unshift(w);
renderCanvas();selectWidget(id);saveToStorage();
}

// ---- Draggable Modals ----
function makeModalDraggable(dlgId) {
    var dlg = document.getElementById(dlgId);
    if (!dlg) return;
    var header = dlg.querySelector(".modal-header") || dlg.querySelector("h3");
    if (!header) return;
    header.style.cursor = "move";
    header.addEventListener("mousedown", function(e) {
        if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON" || e.target.tagName === "SELECT") return;
        var modal = dlg.querySelector(".modal");
        if (!modal) return;
        var startX = e.clientX, startY = e.clientY;
        var origLeft = modal.offsetLeft, origTop = modal.offsetTop;
        function onMove(ev) {
            modal.style.left = (origLeft + ev.clientX - startX) + "px";
            modal.style.top = (origTop + ev.clientY - startY) + "px";
            modal.style.position = "fixed"; modal.style.margin = "0"
        }
        function onUp() {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        e.preventDefault();
    });
}

// Make all dialogs draggable after DOM loaded
document.addEventListener("DOMContentLoaded", function() {
    var dialogIds = ["dlgDevice", "dlgTag", "dlgScreen", "dlgWidget"];
    dialogIds.forEach(function(id) { makeModalDraggable(id); });
});

// ==================== HELPERS ====================
function log(msg) {
    const time = new Date().toLocaleTimeString();
    console.log("[HMI] " + msg);
}

function updateStatusBar() {
    const screen = appState.screens.find(s => s.id === appState.currentScreen);
    if (screen) {
        document.getElementById("sbRight").textContent =
            "画面: " + screen.width + "×" + screen.height + " | 元件: " + screen.widgets.length;
    }
}
