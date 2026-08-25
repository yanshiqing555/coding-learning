const fs = require("fs");
const path = require("path");

const OUT_DIR = __dirname;
const now = Date.now();
let seedN = Math.floor(Math.random() * 1000000);
let vn = 1000;
const nextSeed = () => ++seedN;
const nextVn = () => ++vn;
const els = [];

// ---------- helpers ----------
function base(id, type, x, y, w, h, o = {}) {
  return {
    id, type, x, y, width: w, height: h,
    angle: 0,
    strokeColor: o.stroke ?? "#1e1e1e",
    backgroundColor: o.bg ?? "transparent",
    fillStyle: o.fill ?? "solid",
    strokeWidth: o.sw ?? 2,
    strokeStyle: o.ss ?? "solid",
    roughness: o.rough ?? 0,
    opacity: o.op ?? 100,
    groupIds: o.groups ?? [],
    frameId: null,
    roundness: o.round ?? null,
    seed: nextSeed(),
    version: 1,
    versionNonce: nextVn(),
    isDeleted: false,
    boundElements: null,
    updated: now,
    link: null,
    locked: false,
  };
}

function tWidth(s, fs, bold = false) {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c >= 0x2e80) w += fs;
    else if (ch === " ") w += fs * 0.3;
    else if (ch === "I" || ch === "l" || ch === "|" || ch === "." || ch === ":" || ch === "/") w += fs * 0.3;
    else if (ch === "M" || ch === "W" || ch === "@" || ch === "%") w += fs * (bold ? 0.85 : 0.75);
    else w += fs * (bold ? 0.62 : 0.55);
  }
  return w;
}

function textEl(id, x, y, s, o = {}) {
  const fs = o.fs ?? 18;
  const w = tWidth(s, fs, o.bold);
  const h = fs * 1.25;
  const el = base(id, "text", x, y, w, h, { stroke: o.color ?? "#1e1e1e", sw: 1 });
  el.text = s;
  el.fontSize = fs;
  el.fontFamily = o.family ?? 2;
  el.textAlign = "left";
  el.verticalAlign = "top";
  el.containerId = null;
  el.originalText = s;
  el.autoResize = true;
  el.lineHeight = 1.25;
  return el;
}

function rectEl(id, x, y, w, h, o = {}) {
  const el = base(id, "rectangle", x, y, w, h, o);
  el.roundness = o.round ?? { type: 3 };
  return el;
}
function ellEl(id, cx, cy, r, o = {}) {
  return base(id, "ellipse", cx - r, cy - r, r * 2, r * 2, o);
}
function diaEl(id, cx, cy, w, h, o = {}) {
  return base(id, "diamond", cx - w / 2, cy - h / 2, w, h, o);
}
function polyEl(id, type, x, y, pts, o = {}) {
  let minX = 0, maxX = 0, minY = 0, maxY = 0;
  for (const p of pts) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
  }
  const el = base(id, type, x + minX, y + minY, maxX - minX, maxY - minY, o);
  el.roundness = o.round ?? { type: 2 };
  el.points = pts.map(p => [p[0] - minX, p[1] - minY]);
  if (type === "arrow") {
    el.lastCommittedPoint = null;
    el.startBinding = null;
    el.endBinding = null;
    el.startArrowhead = null;
    el.endArrowhead = "arrow";
  }
  return el;
}

function centerText(id, cx, cy, s, o = {}) {
  const t = textEl(id, 0, 0, s, o);
  t.x = cx - t.width / 2;
  t.y = cy - t.height / 2;
  return t;
}
function rightText(id, xRight, y, s, o = {}) {
  const t = textEl(id, 0, 0, s, o);
  t.x = xRight - t.width;
  t.y = y;
  return t;
}

const C = {
  blue: "#0070C0", dblue: "#005A9E", pipe: "#2E75B6",
  green: "#00B050", dgreen: "#008A3B",
  red: "#E4002B", dred: "#A00000",
  yellow: "#FFC000", dyellow: "#D48806",
};

// =========================================================
// 1. 外壳与屏幕
// =========================================================
els.push(rectEl("bez", 10, 10, 1420, 900, { stroke: "#263238", sw: 8, bg: "#1B2733" }));
els.push(rectEl("screen", 30, 30, 1380, 860, { stroke: C.blue, sw: 3, bg: "#EAF1F8" }));

// 2. 标题栏
els.push(rectEl("hdr", 50, 50, 1340, 80, { stroke: C.blue, sw: 1, bg: C.blue }));
els.push(textEl("hdr-model", 70, 64, "SIMATIC HMI TP1500 Comfort", { fs: 20, color: "#FFFFFF" }));
els.push(centerText("hdr-title", 720, 84, "电机控制画面", { fs: 30, color: "#FFFFFF" }));
els.push(centerText("hdr-sub", 720, 106, "MOTOR CONTROL PANEL", { fs: 12, color: "#D6E7F7" }));
els.push(rightText("hdr-clock", 1380, 66, "2026-08-07 14:30:25", { fs: 16, color: "#FFFFFF" }));

// 3. 左面板 - 控制区
els.push(rectEl("p1", 60, 160, 380, 380, { stroke: C.blue, sw: 2, bg: "#FFFFFF" }));
els.push(textEl("p1-title", 75, 172, "控制区  CONTROL", { fs: 18, color: C.blue }));

// 启动按钮
els.push(rectEl("btn-start", 85, 225, 155, 80, { stroke: C.dgreen, sw: 2, bg: C.green, groups: ["g-start"] }));
els.push(centerText("btn-start-t1", 162.5, 258, "启动", { fs: 24, color: "#FFFFFF", groups: ["g-start"] }));
els.push(centerText("btn-start-t2", 162.5, 282, "START", { fs: 13, color: "#FFFFFF", groups: ["g-start"] }));

// 停止按钮
els.push(rectEl("btn-stop", 260, 225, 155, 80, { stroke: C.dred, sw: 2, bg: C.red, groups: ["g-stop"] }));
els.push(centerText("btn-stop-t1", 337.5, 258, "停止", { fs: 24, color: "#FFFFFF", groups: ["g-stop"] }));
els.push(centerText("btn-stop-t2", 337.5, 282, "STOP", { fs: 13, color: "#FFFFFF", groups: ["g-stop"] }));

// 指示灯
els.push(ellEl("run-lamp", 125, 359, 29, { stroke: C.dgreen, sw: 2, bg: C.green, groups: ["g-run"] }));
els.push(ellEl("run-hl", 133, 351, 9, { stroke: "#FFFFFF", bg: "#FFFFFF", op: 40, groups: ["g-run"] }));
els.push(centerText("run-label", 125, 412, "运行", { fs: 16, color: C.dgreen, groups: ["g-run"] }));
els.push(ellEl("fault-lamp", 250, 359, 29, { stroke: C.dred, sw: 2, bg: C.red, groups: ["g-fault"] }));
els.push(ellEl("fault-hl", 258, 351, 9, { stroke: "#FFFFFF", bg: "#FFFFFF", op: 40, groups: ["g-fault"] }));
els.push(centerText("fault-label", 250, 412, "故障", { fs: 16, color: C.dred, groups: ["g-fault"] }));
els.push(ellEl("ready-lamp", 375, 359, 29, { stroke: C.dyellow, sw: 2, bg: C.yellow, groups: ["g-ready"] }));
els.push(ellEl("ready-hl", 383, 351, 9, { stroke: "#FFFFFF", bg: "#FFFFFF", op: 40, groups: ["g-ready"] }));
els.push(centerText("ready-label", 375, 412, "就绪", { fs: 16, color: "#B8860B", groups: ["g-ready"] }));

// 4. 中面板 - 工艺流程图
els.push(rectEl("p2", 470, 160, 440, 380, { stroke: C.blue, sw: 2, bg: "#FFFFFF" }));
els.push(textEl("p2-title", 485, 172, "工艺流程图  PROCESS", { fs: 18, color: C.blue }));

// 水箱
els.push(rectEl("tank", 505, 240, 150, 240, { stroke: C.blue, sw: 2.5, bg: "#DCE9F5", groups: ["g-tank"] }));
els.push(rectEl("tank-liquid", 512, 310, 136, 168, { stroke: "#00A2E8", bg: "#00A2E8", groups: ["g-tank"] }));
els.push(polyEl("tank-level", "line", 512, 420, [[0, 0], [136, 0]], { stroke: C.blue, sw: 2, ss: "dashed", groups: ["g-tank"] }));
els.push(centerText("tank-level-txt", 580, 405, "65%", { fs: 13, color: "#FFFFFF", groups: ["g-tank"] }));
els.push(centerText("tank-label", 580, 214, "T-101 水箱", { fs: 13, color: C.dblue, groups: ["g-tank"] }));

// 泵
els.push(ellEl("pump", 720, 390, 56, { stroke: C.blue, sw: 3, bg: "#FFFFFF", groups: ["g-pump"] }));
els.push(centerText("pump-m", 720, 390, "M", { fs: 30, color: C.blue, groups: ["g-pump"] }));
els.push(centerText("pump-label", 720, 305, "泵  P-101", { fs: 13, color: C.dblue, groups: ["g-pump"] }));

// 阀
els.push(diaEl("valve", 850, 390, 80, 80, { stroke: C.dyellow, sw: 2.5, bg: C.yellow, groups: ["g-valve"] }));
els.push(centerText("valve-txt", 850, 390, "V-201", { fs: 16, color: "#6B4F00", groups: ["g-valve"] }));
els.push(centerText("valve-label", 850, 318, "调节阀", { fs: 13, color: C.dblue, groups: ["g-valve"] }));

// 管道与流向
els.push(polyEl("pipe-in-1", "line", 580, 480, [[0, 0], [0, 35], [150, 35], [150, -67]], { stroke: C.pipe, sw: 4 }));
els.push(polyEl("flow-1", "arrow", 620, 515, [[0, 0], [90, 0]], { stroke: C.pipe, sw: 3 }));
els.push(polyEl("pipe-pv", "line", 776, 390, [[0, 0], [30, 0]], { stroke: C.pipe, sw: 4 }));
els.push(polyEl("flow-2", "arrow", 782, 390, [[0, 0], [21, 0]], { stroke: C.pipe, sw: 3 }));
els.push(polyEl("pipe-out", "arrow", 890, 390, [[0, 0], [20, 0], [20, -140]], { stroke: C.pipe, sw: 4 }));
els.push(textEl("out-label", 922, 286, "出水 OUT", { fs: 12, color: C.pipe }));

// 5. 右面板 - 数据监控
els.push(rectEl("p3", 940, 160, 400, 380, { stroke: C.blue, sw: 2, bg: "#FFFFFF" }));
els.push(textEl("p3-title", 955, 172, "数据监控  DATA", { fs: 18, color: C.blue }));

const rows = [
  { id: "r1", label: "设定频率 SET FREQ", y: 215, val: "50.00 Hz", boxBg: "#FFF9E6", boxSt: "#C0A000", vc: "#7F6000" },
  { id: "r2", label: "实际频率 ACT FREQ", y: 272, val: "49.98 Hz", boxBg: "#EAF6FF", boxSt: C.blue, vc: "#005A9E" },
  { id: "r3", label: "运行电流 CURRENT", y: 329, val: "12.35 A", boxBg: "#EAF6FF", boxSt: C.blue, vc: "#005A9E" },
  { id: "r4", label: "运行时间 RUNTIME", y: 386, val: "1256.5 h", boxBg: "#EAF6FF", boxSt: C.blue, vc: "#005A9E" },
];
for (const r of rows) {
  const g = "g-" + r.id;
  els.push(textEl(r.id + "-label", 960, r.y + 5, r.label, { fs: 15, color: "#333333", groups: [g] }));
  els.push(rectEl(r.id + "-box", 1190, r.y, 130, 42, { stroke: r.boxSt, sw: 1.5, bg: r.boxBg, groups: [g] }));
  els.push(centerText(r.id + "-val", 1255, r.y + 21, r.val, { fs: 18, color: r.vc, groups: [g] }));
}

// 报警信息
els.push(textEl("alarm-label", 960, 452, "报警信息  ALARM LIST", { fs: 15, color: C.dred, groups: ["g-alarm"] }));
els.push(rectEl("alarm-box", 960, 480, 360, 52, { stroke: C.red, sw: 2, bg: "#FFF3F3", groups: ["g-alarm"] }));
els.push(centerText("alarm-txt", 1140, 506, "08-07 14:28  电机过载报警 ALARM", { fs: 16, color: C.dred, groups: ["g-alarm"] }));

// 6. 右侧功能键
els.push(textEl("fkey-title", 1350, 165, "功能键", { fs: 11, color: "#666666" }));
for (let i = 1; i <= 8; i++) {
  const y = 180 + (i - 1) * 44;
  const g = "g-f" + i;
  els.push(rectEl("fkey-" + i, 1350, y, 50, 36, { stroke: C.blue, sw: 1.5, bg: "#D9E4F0", groups: [g] }));
  els.push(centerText("fkey-t" + i, 1375, y + 18, "F" + i, { fs: 13, color: C.dblue, groups: [g] }));
}

// 7. 底部状态栏
els.push(rectEl("status", 60, 570, 1280, 60, { stroke: C.blue, sw: 2, bg: "#F7FAFD", groups: ["g-status"] }));
els.push(ellEl("status-lamp", 100, 600, 15, { stroke: C.dgreen, sw: 2, bg: C.green, groups: ["g-status"] }));
els.push(textEl("status-txt", 125, 592, "系统状态: 运行正常  SYSTEM RUNNING", { fs: 18, color: "#006633", groups: ["g-status"] }));
els.push(rightText("status-comm", 1300, 596, "S7-1200 | IP: 192.168.0.1 | PLC 已连接", { fs: 14, color: "#444444", groups: ["g-status"] }));

// 8. 导航按钮
const navs = ["画面 1", "画面 2", "画面 3", "报警", "设置", "手动/自动"];
navs.forEach((label, i) => {
  const x = 140 + i * 190;
  const g = "g-nav" + (i + 1);
  const active = i === 0;
  els.push(rectEl("nav-" + (i + 1), x, 665, 170, 55, { stroke: "#003E6B", sw: 2, bg: active ? C.dblue : C.blue, groups: [g] }));
  els.push(centerText("nav-t" + (i + 1), x + 85, 692.5, label, { fs: 18, color: "#FFFFFF", groups: [g] }));
});

// 9. 页脚
els.push(rightText("foot-siemens", 1310, 790, "SIEMENS", { fs: 22, color: C.blue }));
els.push(textEl("foot-note", 70, 795, "HMI 触摸屏画面设计 · Excalidraw 演示", { fs: 12, color: "#888888" }));

// =========================================================
// 输出 .excalidraw
// =========================================================
const file = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements: els,
  appState: { gridSize: null, viewBackgroundColor: "#ffffff" },
  files: {},
};

const outPath = path.join(OUT_DIR, "西门子触摸屏画面.excalidraw");
fs.writeFileSync(outPath, JSON.stringify(file, null, 2), "utf8");
console.log("written:", outPath, els.length, "elements");

// =========================================================
// SVG 预览
// =========================================================
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const W = 1440, H = 920;
const parts = [];
parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Segoe UI','Microsoft YaHei',Arial,sans-serif">`);
parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`);
for (const el of els) {
  if (el.isDeleted) continue;
  const op = `opacity:${el.opacity / 100}`;
  if (el.type === "rectangle") {
    const rx = el.roundness && el.roundness.type === 3 ? Math.min(10, el.height / 4) : 0;
    parts.push(`<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${rx}" fill="${el.backgroundColor}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" stroke-dasharray="${el.strokeStyle === "dashed" ? "8 6" : ""}" style="${op}"/>`);
  } else if (el.type === "ellipse") {
    parts.push(`<ellipse cx="${el.x + el.width / 2}" cy="${el.y + el.height / 2}" rx="${el.width / 2}" ry="${el.height / 2}" fill="${el.backgroundColor}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" style="${op}"/>`);
  } else if (el.type === "diamond") {
    const cx = el.x + el.width / 2, cy = el.y + el.height / 2;
    parts.push(`<polygon points="${cx},${el.y} ${el.x + el.width},${cy} ${cx},${el.y + el.height} ${el.x},${cy}" fill="${el.backgroundColor}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" style="${op}"/>`);
  } else if (el.type === "text") {
    parts.push(`<text x="${el.x + el.width / 2}" y="${el.y + el.height / 2}" font-size="${el.fontSize}" fill="${el.strokeColor}" text-anchor="middle" dominant-baseline="central" style="${op}">${esc(el.text)}</text>`);
  } else if (el.type === "line" || el.type === "arrow") {
    const pts = el.points.map(p => `${el.x + p[0]},${el.y + p[1]}`).join(" ");
    parts.push(`<polyline points="${pts}" fill="none" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" stroke-linecap="round" stroke-dasharray="${el.strokeStyle === "dashed" ? "8 6" : ""}" style="${op}"/>`);
    if (el.type === "arrow" && el.endArrowhead) {
      const ps = el.points;
      const last = ps[ps.length - 1], prev = ps[ps.length - 2];
      const dx = last[0] - prev[0], dy = last[1] - prev[1];
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const ax = el.x + last[0], ay = el.y + last[1];
      const hl = 13, hw = 7;
      const bx = ax - ux * hl, by = ay - uy * hl;
      const px = -uy, py = ux;
      parts.push(`<polygon points="${ax},${ay} ${bx + px * hw},${by + py * hw} ${bx - px * hw},${by - py * hw}" fill="${el.strokeColor}" style="${op}"/>`);
    }
  }
}
parts.push("</svg>");

const svgPath = path.join(OUT_DIR, "preview.svg");
fs.writeFileSync(svgPath, parts.join("\n"), "utf8");
console.log("written:", svgPath);
