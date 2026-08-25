// ================================================================
// HMI-Studio 标签/变量数据库 (Tag Database)
// ================================================================

class TagDatabase {
    constructor() {
        this.tags = [];
        this.groups = [];
        this._nextId = 1;
        this._onChanged = null;
    }

    onChanged(callback) { this._onChanged = callback; }

    _fireChange() { if (this._onChanged) this._onChanged(this); }

    // ---- 标签管理 ----
    addTag(tag) {
        if (!tag.id) tag.id = "TAG_" + (this._nextId++);
        if (!tag.name) tag.name = "Tag" + tag.id;
        this.tags.push(tag);
        this._fireChange();
        return tag;
    }

    removeTag(id) {
        this.tags = this.tags.filter(t => t.id !== id);
        this._fireChange();
    }

    updateTag(id, updates) {
        const tag = this.tags.find(t => t.id === id);
        if (tag) Object.assign(tag, updates);
        this._fireChange();
        return tag;
    }

    getTag(id) { return this.tags.find(t => t.id === id); }
    getAllTags() { return [...this.tags]; }

    // ---- 分组管理 ----
    addGroup(name) {
        const group = { id: "GRP_" + (this._nextId++), name, tags: [] };
        this.groups.push(group);
        this._fireChange();
        return group;
    }

    removeGroup(id) {
        this.groups = this.groups.filter(g => g.id !== id);
        this._fireChange();
    }

    // ---- 导入/导出 ----
    toJSON() {
        return JSON.stringify({ tags: this.tags, groups: this.groups }, null, 2);
    }

    fromJSON(json) {
        const data = typeof json === "string" ? JSON.parse(json) : json;
        this.tags = data.tags || [];
        this.groups = data.groups || [];
        const maxId = Math.max(1, ...this.tags.map(t => {
            const n = parseInt(t.id.replace("TAG_", ""));
            return isNaN(n) ? 0 : n;
        }), ...this.groups.map(g => {
            const n = parseInt(g.id.replace("GRP_", ""));
            return isNaN(n) ? 0 : n;
        }));
        this._nextId = maxId + 1;
        this._fireChange();
    }

    saveToFile(filepath) {
        const fs = require("fs");
        fs.writeFileSync(filepath, this.toJSON(), "utf8");
    }

    loadFromFile(filepath) {
        const fs = require("fs");
        if (fs.existsSync(filepath)) {
            this.fromJSON(fs.readFileSync(filepath, "utf8"));
        }
    }

    // ---- 创建默认标签 (示例) ----
    createDemoTags() {
        const demoDevices = [
            { protocol: "modbus-tcp", ip: "192.168.0.1", port: 502, unit: 1 },
        ];
        const demoTags = [
            { name: "运行状态", address: "M0", type: "bool", protocol: "modbus-tcp" },
            { name: "故障报警", address: "M1", type: "bool", protocol: "modbus-tcp" },
            { name: "设备温度", address: "D100", type: "word", protocol: "modbus-tcp" },
            { name: "设备压力", address: "D101", type: "word", protocol: "modbus-tcp" },
            { name: "生产速度", address: "D200", type: "dword", protocol: "modbus-tcp" },
            { name: "产品计数", address: "D300", type: "dword", protocol: "modbus-tcp" },
            { name: "电机电流", address: "D102", type: "word", protocol: "modbus-tcp" },
            { name: "阀门状态", address: "M2", type: "bool", protocol: "modbus-tcp" },
            { name: "设定温度", address: "D103", type: "word", protocol: "modbus-tcp" },
            { name: "运行时间", address: "D400", type: "dword", protocol: "modbus-tcp" },
        ];
        demoTags.forEach(t => this.addTag(t));
        this.addGroup("设备状态");
        this.addGroup("过程数据");
        this.addGroup("报警信息");
    }
}

if (typeof module !== "undefined") module.exports = { TagDatabase };
