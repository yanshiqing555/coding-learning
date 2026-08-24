# PLC 与工业机器人编程学习仓库

电气工程自动化学习记录，涵盖 PLC 与工业机器人编程。

## 内容

### PLC 编程
- **梯形图 (Ladder Diagram, LD)**
- **SCL (Structured Control Language)** — 西门子结构化控制语言
- **ST (Structured Text)** — 结构化文本，IEC 61131-3 标准

### 工业机器人编程（四大家族）
| 品牌 | 编程语言 | 目录 |
|------|----------|------|
| ABB | RAPID | `robot/abb/` |
| FANUC（发那科） | KAREL / TP | `robot/fanuc/` |
| KUKA（库卡） | KRL | `robot/kuka/` |
| Yaskawa（安川） | INFORM | `robot/yaskawa/` |

## 目录结构

```
.
├── plc/
│   ├── ladder/          # 梯形图
│   ├── scl/             # SCL
│   └── st/              # 结构化文本
├── robot/
│   ├── abb/             # ABB RAPID
│   ├── fanuc/           # FANUC KAREL/TP
│   ├── kuka/            # KUKA KRL
│   └── yaskawa/         # 安川 INFORM
├── examples/            # 完整项目示例
└── notes/               # 学习笔记
```

## 常用 PLC 品牌

- 西门子 (Siemens) — TIA Portal, STEP 7
- 三菱 (Mitsubishi) — GX Works
- 欧姆龙 (Omron) — CX-Programmer
- 罗克韦尔 (Allen-Bradley) — Studio 5000
- 施耐德 (Schneider) — EcoStruxure

## 提交规范

每次提交写明：
- 程序功能说明
- 设备品牌/型号
- 编程语言
