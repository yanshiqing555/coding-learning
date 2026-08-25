using System;
using System.Drawing;
using System.Windows.Forms;

namespace SiemensModbusTool
{
    public class MainForm : Form
    {
        // Connection
        private TextBox txtIp;
        private NumericUpDown nudPort;
        private NumericUpDown nudUnitId;
        private Button btnConn;

        // Read
        private ComboBox cmbRFunc;
        private NumericUpDown nudRAddr;
        private NumericUpDown nudRQty;
        private DataGridView dgvData;
        private Button btnRead;
        private CheckBox chkPoll;
        private NumericUpDown nudInterval;

        // Write
        private ComboBox cmbWFunc;
        private NumericUpDown nudWAddr;
        private TextBox txtWData;
        private Button btnWrite;

        // Logs
        private RichTextBox rtxLog;
        private RichTextBox rtxErrLog;
        private Button btnClearLog;
        private Button btnClearErr;

        // Status
        private StatusStrip sb;
        private ToolStripStatusLabel lblStatus;

        // Core
        private ModbusTcpClient _cl;
        private Timer _pollTimer;
        private SplitContainer _split;

        public MainForm()
        {
            _cl = new ModbusTcpClient();
            _cl.OnLog += WriteLog;
            _cl.OnError += WriteError;
            _cl.OnConnectionChanged += OnConnChange;

            _pollTimer = new Timer();
            _pollTimer.Tick += OnPoll;

            InitUI();
        }

        private void InitUI()
        {
            this.Text = "Siemens ModbusTCP 通讯工具";
            this.Size = new Size(1100, 750);
            this.MinimumSize = new Size(900, 600);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(235, 235, 242);
            this.Font = new Font("Microsoft YaHei", 9);
            this.KeyPreview = true;
            this.KeyDown += OnKeyDown;

            // ============== TOP BAR ==============
            TableLayoutPanel top = new TableLayoutPanel();
            top.Dock = DockStyle.Top;
            top.Height = 95;
            top.Padding = new Padding(10);
            top.BackColor = Color.White;
            top.ColumnCount = 8;
            top.RowCount = 2;
            int[] cw = { 50, 125, 45, 70, 55, 70, 100, 0 };
            for (int i = 0; i < 7; i++)
                top.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, cw[i]));
            top.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

            top.Controls.Add(MkLbl("IP"), 0, 0);
            txtIp = new TextBox();
            txtIp.Text = "192.168.0.1";
            txtIp.Dock = DockStyle.Fill;
            txtIp.Font = new Font("Consolas", 10);
            top.Controls.Add(txtIp, 1, 0);

            top.Controls.Add(MkLbl("端口"), 2, 0);
            nudPort = new NumericUpDown();
            nudPort.Minimum = 1; nudPort.Maximum = 65535; nudPort.Value = 502;
            nudPort.Dock = DockStyle.Fill;
            nudPort.Font = new Font("Consolas", 10);
            top.Controls.Add(nudPort, 3, 0);

            top.Controls.Add(MkLbl("单元"), 4, 0);
            nudUnitId = new NumericUpDown();
            nudUnitId.Minimum = 0; nudUnitId.Maximum = 255; nudUnitId.Value = 1;
            nudUnitId.Dock = DockStyle.Fill;
            nudUnitId.Font = new Font("Consolas", 10);
            top.Controls.Add(nudUnitId, 5, 0);

            btnConn = new Button();
            btnConn.Text = "连 接";
            btnConn.FlatStyle = FlatStyle.Flat;
            btnConn.BackColor = Color.FromArgb(52, 152, 219);
            btnConn.ForeColor = Color.White;
            btnConn.Font = new Font("Microsoft YaHei", 10, FontStyle.Bold);
            btnConn.Cursor = Cursors.Hand;
            btnConn.FlatAppearance.BorderSize = 0;
            btnConn.Click += OnConnect;
            top.Controls.Add(btnConn, 6, 0);
            top.SetColumnSpan(btnConn, 2);

            Label hint = MkLbl("支持功能码 01/02/03/04/05/06/16 | 默认端口 502 | Ctrl+R读取 Ctrl+W写入");
            hint.ForeColor = Color.Gray;
            hint.Font = new Font("Microsoft YaHei", 8);
            top.Controls.Add(hint, 0, 1);
            top.SetColumnSpan(hint, 8);

            // ============== SPLIT CONTAINER ==============
            _split = new SplitContainer();
            _split.Dock = DockStyle.Fill;
            _split.Orientation = Orientation.Vertical;
            // Min sizes & splitter set in OnLoad

            // ============== LEFT PANEL ==============
            TableLayoutPanel left = new TableLayoutPanel();
            left.Dock = DockStyle.Fill;
            left.ColumnCount = 2;
            left.RowCount = 2;
            left.Padding = new Padding(6);
            left.BackColor = Color.White;
            left.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
            left.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
            left.RowStyles.Add(new RowStyle(SizeType.Absolute, 300));
            left.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

            // -- Read --
            GroupBox gRead = new GroupBox();
            gRead.Text = "读取操作";
            gRead.Dock = DockStyle.Fill;
            gRead.Font = new Font("Microsoft YaHei", 9, FontStyle.Bold);
            gRead.Padding = new Padding(6);

            TableLayoutPanel rp = new TableLayoutPanel();
            rp.Dock = DockStyle.Fill;
            rp.ColumnCount = 2;
            rp.RowCount = 5;
            rp.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 65));
            rp.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

            rp.Controls.Add(MkLbl("功能码:"), 0, 0);
            cmbRFunc = new ComboBox();
            cmbRFunc.Dock = DockStyle.Fill; cmbRFunc.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbRFunc.Items.Add("01-读线圈"); cmbRFunc.Items.Add("02-读离散输入");
            cmbRFunc.Items.Add("03-读保持寄存器"); cmbRFunc.Items.Add("04-读输入寄存器");
            cmbRFunc.SelectedIndex = 2;
            rp.Controls.Add(cmbRFunc, 1, 0);

            rp.Controls.Add(MkLbl("起始地址:"), 0, 1);
            nudRAddr = new NumericUpDown();
            nudRAddr.Minimum = 0; nudRAddr.Maximum = 65535; nudRAddr.Value = 0;
            nudRAddr.Dock = DockStyle.Fill; nudRAddr.Font = new Font("Consolas", 10);
            rp.Controls.Add(nudRAddr, 1, 1);

            rp.Controls.Add(MkLbl("数量:"), 0, 2);
            nudRQty = new NumericUpDown();
            nudRQty.Minimum = 1; nudRQty.Maximum = 125; nudRQty.Value = 10;
            nudRQty.Dock = DockStyle.Fill; nudRQty.Font = new Font("Consolas", 10);
            rp.Controls.Add(nudRQty, 1, 2);

            dgvData = new DataGridView();
            dgvData.Dock = DockStyle.Fill; dgvData.ReadOnly = true;
            dgvData.AllowUserToAddRows = false; dgvData.RowHeadersVisible = false;
            dgvData.BackgroundColor = Color.White; dgvData.BorderStyle = BorderStyle.Fixed3D;
            dgvData.Font = new Font("Consolas", 9);
            dgvData.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
            dgvData.Columns.Add("a", "地址"); dgvData.Columns.Add("d", "值(十进制)");
            dgvData.Columns.Add("h", "值(十六进制)");
            dgvData.Columns[0].Width = 100;
            rp.Controls.Add(dgvData, 0, 3);
            rp.SetColumnSpan(dgvData, 2);

            FlowLayoutPanel rb = new FlowLayoutPanel();
            rb.Dock = DockStyle.Fill; rb.FlowDirection = FlowDirection.LeftToRight; rb.WrapContents = false;
            btnRead = new Button();
            btnRead.Text = "读取"; btnRead.FlatStyle = FlatStyle.Flat;
            btnRead.BackColor = Color.FromArgb(46, 204, 113); btnRead.ForeColor = Color.White;
            btnRead.Font = new Font("Microsoft YaHei", 9, FontStyle.Bold);
            btnRead.Width = 100; btnRead.Height = 30; btnRead.Cursor = Cursors.Hand;
            btnRead.Enabled = false; btnRead.FlatAppearance.BorderSize = 0;
            btnRead.Click += OnRead;

            chkPoll = new CheckBox();
            chkPoll.Text = "自动轮询"; chkPoll.AutoSize = true;
            chkPoll.CheckedChanged += OnPollChanged;

            nudInterval = new NumericUpDown();
            nudInterval.Minimum = 100; nudInterval.Maximum = 60000; nudInterval.Value = 1000;
            nudInterval.Increment = 100; nudInterval.Width = 65;
            nudInterval.Font = new Font("Consolas", 9);

            Label ms = new Label(); ms.Text = "ms"; ms.AutoSize = true;

            rb.Controls.Add(btnRead); rb.Controls.Add(chkPoll);
            rb.Controls.Add(nudInterval); rb.Controls.Add(ms);
            rp.Controls.Add(rb, 0, 4); rp.SetColumnSpan(rb, 2);
            gRead.Controls.Add(rp);
            left.Controls.Add(gRead, 0, 0);

            // -- Write --
            GroupBox gWrite = new GroupBox();
            gWrite.Text = "写入操作";
            gWrite.Dock = DockStyle.Fill;
            gWrite.Font = new Font("Microsoft YaHei", 9, FontStyle.Bold);
            gWrite.Padding = new Padding(6);

            TableLayoutPanel wp = new TableLayoutPanel();
            wp.Dock = DockStyle.Fill; wp.ColumnCount = 2; wp.RowCount = 5;
            wp.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 65));
            wp.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

            wp.Controls.Add(MkLbl("功能码:"), 0, 0);
            cmbWFunc = new ComboBox();
            cmbWFunc.Dock = DockStyle.Fill; cmbWFunc.DropDownStyle = ComboBoxStyle.DropDownList;
            cmbWFunc.Items.Add("05-写单线圈"); cmbWFunc.Items.Add("06-写单寄存器");
            cmbWFunc.Items.Add("16-写多寄存器");
            cmbWFunc.SelectedIndex = 1;
            wp.Controls.Add(cmbWFunc, 1, 0);

            wp.Controls.Add(MkLbl("起始地址:"), 0, 1);
            nudWAddr = new NumericUpDown();
            nudWAddr.Minimum = 0; nudWAddr.Maximum = 65535; nudWAddr.Value = 0;
            nudWAddr.Dock = DockStyle.Fill; nudWAddr.Font = new Font("Consolas", 10);
            wp.Controls.Add(nudWAddr, 1, 1);

            wp.Controls.Add(MkLbl("写入数据:"), 0, 2);
            txtWData = new TextBox();
            txtWData.Dock = DockStyle.Fill; txtWData.Font = new Font("Consolas", 10);
            txtWData.Text = "0";
            wp.Controls.Add(txtWData, 1, 2);

            Label tip = new Label();
            tip.Text = "多个值用逗号分隔, 如: 100,200,300"; tip.AutoSize = true;
            tip.Font = new Font("Microsoft YaHei", 8); tip.ForeColor = Color.Gray;
            wp.Controls.Add(tip, 1, 3);

            btnWrite = new Button();
            btnWrite.Text = "写入"; btnWrite.FlatStyle = FlatStyle.Flat;
            btnWrite.BackColor = Color.FromArgb(231, 76, 60); btnWrite.ForeColor = Color.White;
            btnWrite.Font = new Font("Microsoft YaHei", 9, FontStyle.Bold);
            btnWrite.Width = 100; btnWrite.Height = 30; btnWrite.Cursor = Cursors.Hand;
            btnWrite.Enabled = false; btnWrite.FlatAppearance.BorderSize = 0;
            btnWrite.Click += OnWrite;
            wp.Controls.Add(btnWrite, 0, 4); wp.SetColumnSpan(btnWrite, 2);

            gWrite.Controls.Add(wp);
            left.Controls.Add(gWrite, 1, 0);

            // -- Communication Log --
            GroupBox gLog = new GroupBox();
            gLog.Text = "通讯日志";
            gLog.Dock = DockStyle.Fill;
            gLog.Font = new Font("Microsoft YaHei", 9, FontStyle.Bold);
            gLog.Padding = new Padding(6);

            TableLayoutPanel lp = new TableLayoutPanel();
            lp.Dock = DockStyle.Fill; lp.ColumnCount = 1; lp.RowCount = 2;
            lp.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            lp.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));

            rtxLog = new RichTextBox();
            rtxLog.Dock = DockStyle.Fill; rtxLog.Font = new Font("Consolas", 9);
            rtxLog.BackColor = Color.FromArgb(30, 30, 30);
            rtxLog.ForeColor = Color.FromArgb(0, 230, 0);
            rtxLog.ReadOnly = true; rtxLog.WordWrap = true;
            lp.Controls.Add(rtxLog, 0, 0);

            btnClearLog = new Button();
            btnClearLog.Text = "清除日志"; btnClearLog.FlatStyle = FlatStyle.Flat;
            btnClearLog.BackColor = Color.FromArgb(149, 165, 166); btnClearLog.ForeColor = Color.White;
            btnClearLog.Width = 100; btnClearLog.Height = 26; btnClearLog.Cursor = Cursors.Hand;
            btnClearLog.FlatAppearance.BorderSize = 0;
            btnClearLog.Click += delegate { rtxLog.Clear(); };
            lp.Controls.Add(btnClearLog, 0, 1);

            gLog.Controls.Add(lp);
            left.Controls.Add(gLog, 0, 1);
            left.SetColumnSpan(gLog, 2);

            _split.Panel1.Controls.Add(left);

            // ============== RIGHT PANEL ==============
            SplitContainer rightSplit = new SplitContainer();
            rightSplit.Dock = DockStyle.Fill;
            rightSplit.Orientation = Orientation.Horizontal;
            rightSplit.SplitterDistance = 200;

            // -- Top: Usage --
            Panel pnlInfo = new Panel();
            pnlInfo.Dock = DockStyle.Fill; pnlInfo.Padding = new Padding(6);
            pnlInfo.BackColor = Color.FromArgb(245, 245, 250);

            GroupBox gInfo = new GroupBox();
            gInfo.Text = "使用说明";
            gInfo.Dock = DockStyle.Fill;
            gInfo.Font = new Font("Microsoft YaHei", 9, FontStyle.Bold);

            RichTextBox info = new RichTextBox();
            info.Dock = DockStyle.Fill; info.Font = new Font("Microsoft YaHei", 9);
            info.ReadOnly = true; info.BackColor = Color.FromArgb(250, 250, 255);
            info.BorderStyle = BorderStyle.None;
            info.Text = "[连接] 输入PLC IP -> 点击连接\r\n[读取] 选功能码+地址 -> 读取(Ctrl+R)\r\n[写入] 选功能码+地址+数据 -> 写入(Ctrl+W)\r\n[轮询] 勾选自动轮询, 设置间隔\r\n\r\n地址对照:\r\n保持寄存器 40001 = 地址 0\r\n线圈 00001 = 地址 0\r\n\r\nModbus TCP/IP\r\n.NET Framework 4.8";
            gInfo.Controls.Add(info);
            pnlInfo.Controls.Add(gInfo);
            rightSplit.Panel1.Controls.Add(pnlInfo);

            // -- Bottom: Error Log --
            Panel pnlErr = new Panel();
            pnlErr.Dock = DockStyle.Fill; pnlErr.Padding = new Padding(6);
            pnlErr.BackColor = Color.FromArgb(245, 245, 250);

            GroupBox gErr = new GroupBox();
            gErr.Text = "错误日志 (超时/异常/断线)";
            gErr.Dock = DockStyle.Fill;
            gErr.Font = new Font("Microsoft YaHei", 9, FontStyle.Bold);
            gErr.ForeColor = Color.FromArgb(192, 57, 43);

            TableLayoutPanel ep = new TableLayoutPanel();
            ep.Dock = DockStyle.Fill; ep.ColumnCount = 1; ep.RowCount = 2;
            ep.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            ep.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));

            rtxErrLog = new RichTextBox();
            rtxErrLog.Dock = DockStyle.Fill; rtxErrLog.Font = new Font("Consolas", 9);
            rtxErrLog.BackColor = Color.FromArgb(25, 20, 20);
            rtxErrLog.ForeColor = Color.FromArgb(255, 150, 150);
            rtxErrLog.ReadOnly = true; rtxErrLog.WordWrap = true;
            ep.Controls.Add(rtxErrLog, 0, 0);

            btnClearErr = new Button();
            btnClearErr.Text = "清除错误日志"; btnClearErr.FlatStyle = FlatStyle.Flat;
            btnClearErr.BackColor = Color.FromArgb(192, 57, 43); btnClearErr.ForeColor = Color.White;
            btnClearErr.Width = 110; btnClearErr.Height = 26; btnClearErr.Cursor = Cursors.Hand;
            btnClearErr.FlatAppearance.BorderSize = 0;
            btnClearErr.Click += delegate { rtxErrLog.Clear(); };
            ep.Controls.Add(btnClearErr, 0, 1);

            gErr.Controls.Add(ep);
            pnlErr.Controls.Add(gErr);
            rightSplit.Panel2.Controls.Add(pnlErr);

            _split.Panel2.Controls.Add(rightSplit);

            // ============== STATUS BAR ==============
            sb = new StatusStrip();
            sb.BackColor = Color.FromArgb(52, 73, 94);
            lblStatus = new ToolStripStatusLabel("● 未连接");
            lblStatus.Font = new Font("Microsoft YaHei", 9, FontStyle.Bold);
            lblStatus.ForeColor = Color.FromArgb(231, 76, 60);
            sb.Items.Add(lblStatus);

            // ============== FINAL ==============
            this.Controls.Add(_split);
            this.Controls.Add(top);
            this.Controls.Add(sb);
        }

        protected override void OnLoad(EventArgs e)
        {
            base.OnLoad(e);
            _split.Panel1MinSize = 450;
            _split.Panel2MinSize = 250;
            _split.SplitterDistance = 620;
        }

        // ===================== HELPERS =====================

        private Label MkLbl(string t)
        {
            Label l = new Label(); l.Text = t; l.Dock = DockStyle.Fill;
            l.TextAlign = ContentAlignment.MiddleLeft;
            l.Font = new Font("Microsoft YaHei", 9);
            return l;
        }

        // ===================== EVENTS =====================

        private void OnConnect(object s, EventArgs e)
        {
            if (_cl.IsConnected)
            {
                _pollTimer.Stop(); chkPoll.Checked = false;
                _cl.Disconnect();
                return;
            }

            _cl.IpAddress = txtIp.Text.Trim();
            _cl.Port = (int)nudPort.Value;
            _cl.UnitId = (byte)nudUnitId.Value;

            if (_cl.Connect())
            {
                btnConn.Text = "断 开";
                btnConn.BackColor = Color.FromArgb(231, 76, 60);
                btnRead.Enabled = true;
                btnWrite.Enabled = true;
            }
        }

        private void OnConnChange(bool ok)
        {
            if (this.InvokeRequired)
            {
                this.Invoke(new Action<bool>(OnConnChange), ok);
                return;
            }
            if (!ok)
            {
                btnConn.Text = "连 接";
                btnConn.BackColor = Color.FromArgb(52, 152, 219);
                btnRead.Enabled = false; btnWrite.Enabled = false;
                chkPoll.Checked = false;
                lblStatus.Text = "● 未连接";
                lblStatus.ForeColor = Color.FromArgb(231, 76, 60);
            }
            else
            {
                lblStatus.Text = "● 已连接 " + _cl.IpAddress + ":" + _cl.Port;
                lblStatus.ForeColor = Color.FromArgb(46, 204, 113);
            }
        }

        private void OnRead(object s, EventArgs e) { DoRead(); }

        private void DoRead()
        {
            if (!_cl.IsConnected) { WriteLog("[ERR] 请先连接设备"); return; }

            ushort addr = (ushort)nudRAddr.Value;
            ushort qty = (ushort)nudRQty.Value;
            int idx = cmbRFunc.SelectedIndex;

            try
            {
                if (idx == 0) { bool[] v = _cl.ReadCoils(addr, qty); if (v != null) ShowCoils(addr, v); }
                else if (idx == 2) { ushort[] v = _cl.ReadHoldingRegisters(addr, qty); if (v != null) ShowRegs(addr, v); }
                else if (idx == 3) { ushort[] v = _cl.ReadInputRegisters(addr, qty); if (v != null) ShowRegs(addr, v); }
            }
            catch (Exception ex) { WriteLog("[ERR] 读取异常: " + ex.Message); }
        }

        private void ShowRegs(ushort start, ushort[] v)
        {
            dgvData.Rows.Clear();
            for (int i = 0; i < v.Length; i++)
            {
                int a = start + i;
                dgvData.Rows.Add(string.Format("0x{0:X4} ({1})", a, a), v[i].ToString(), string.Format("0x{0:X4}", v[i]));
            }
        }

        private void ShowCoils(ushort start, bool[] v)
        {
            dgvData.Rows.Clear();
            for (int i = 0; i < v.Length; i++)
            {
                int a = start + i;
                dgvData.Rows.Add(string.Format("0x{0:X4} ({1})", a, a), v[i] ? "ON (1)" : "OFF (0)", v[i] ? "0x01" : "0x00");
            }
        }

        private void OnWrite(object s, EventArgs e)
        {
            if (!_cl.IsConnected) { WriteLog("[ERR] 请先连接设备"); return; }

            ushort addr = (ushort)nudWAddr.Value;
            int idx = cmbWFunc.SelectedIndex;
            string data = txtWData.Text.Trim();

            try
            {
                if (idx == 0)
                {
                    bool v = (data == "1" || "true".Equals(data, StringComparison.OrdinalIgnoreCase));
                    _cl.WriteSingleCoil(addr, v);
                }
                else if (idx == 1)
                {
                    ushort v;
                    if (ushort.TryParse(data, out v)) _cl.WriteSingleRegister(addr, v);
                    else WriteLog("[ERR] 无效数值 0-65535");
                }
                else if (idx == 2)
                {
                    string[] parts = data.Split(new char[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries);
                    ushort[] vals = new ushort[parts.Length];
                    for (int i = 0; i < parts.Length; i++)
                    {
                        if (!ushort.TryParse(parts[i].Trim(), out vals[i]))
                        { WriteLog("[ERR] 第" + (i + 1) + "个数据无效: " + parts[i]); return; }
                    }
                    _cl.WriteMultipleRegisters(addr, vals);
                }
            }
            catch (Exception ex) { WriteLog("[ERR] 写入异常: " + ex.Message); }
        }

        private void OnPollChanged(object s, EventArgs e)
        {
            if (chkPoll.Checked && _cl.IsConnected)
            {
                _pollTimer.Interval = (int)nudInterval.Value;
                _pollTimer.Start();
                WriteLog("[INF] 轮询启动 间隔:" + nudInterval.Value + "ms");
            }
            else
            {
                _pollTimer.Stop();
                if (_cl.IsConnected) WriteLog("[INF] 轮询停止");
            }
        }

        private void OnPoll(object s, EventArgs e) { DoRead(); }

        private void OnKeyDown(object s, KeyEventArgs e)
        {
            if (e.Control && e.KeyCode == Keys.R && btnRead.Enabled) { btnRead.PerformClick(); e.SuppressKeyPress = true; }
            if (e.Control && e.KeyCode == Keys.W && btnWrite.Enabled) { btnWrite.PerformClick(); e.SuppressKeyPress = true; }
        }

        // ===================== LOGGING =====================

        private void WriteLog(string msg)
        {
            if (rtxLog.InvokeRequired)
            {
                rtxLog.Invoke(new Action<string>(WriteLog), msg);
                return;
            }
            string t = DateTime.Now.ToString("HH:mm:ss.fff");
            rtxLog.AppendText("[" + t + "] " + msg + "\n");
            rtxLog.ScrollToCaret();
        }

        private void WriteError(string msg)
        {
            if (rtxErrLog.InvokeRequired)
            {
                rtxErrLog.Invoke(new Action<string>(WriteError), msg);
                return;
            }
            string t = DateTime.Now.ToString("HH:mm:ss.fff");
            rtxErrLog.AppendText("[" + t + "] " + msg + "\n");
            rtxErrLog.ScrollToCaret();
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            _pollTimer.Stop();
            _cl.Disconnect();
            base.OnFormClosing(e);
        }
    }
}
