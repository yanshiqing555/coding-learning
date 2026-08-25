using System;
using System.Net;
using System.Net.Sockets;

namespace SiemensModbusTool
{
    public class ModbusTcpClient : IDisposable
    {
        private TcpClient _tcpClient;
        private NetworkStream _stream;
        private ushort _transactionId;
        private readonly object _lock;

        public string IpAddress { get; set; }
        public int Port { get; set; }
        public byte UnitId { get; set; }

        public bool IsConnected
        {
            get { return _tcpClient != null && _tcpClient.Connected; }
        }

        public event Action<string> OnLog;
        public event Action<string> OnError;
        public event Action<bool> OnConnectionChanged;

        public ModbusTcpClient()
        {
            _lock = new object();
            _transactionId = 0;
            IpAddress = "192.168.0.1";
            Port = 502;
            UnitId = 1;
        }

        public bool Connect()
        {
            try
            {
                Disconnect();
                _tcpClient = new TcpClient();
                _tcpClient.Connect(IPAddress.Parse(IpAddress), Port);
                _stream = _tcpClient.GetStream();
                _stream.ReadTimeout = 5000;
                _stream.WriteTimeout = 5000;
                Log("[OK] 已连接到 " + IpAddress + ":" + Port);
                FireConnection(true);
                return true;
            }
            catch (Exception ex)
            {
                Log("[ERR] 连接失败: " + ex.Message);
                Error("连接超时/失败: " + ex.Message);
                FireConnection(false);
                return false;
            }
        }

        public void Disconnect()
        {
            try { if (_stream != null) _stream.Close(); }
            catch { }
            try { if (_tcpClient != null) _tcpClient.Close(); }
            catch { }
            _stream = null;
            _tcpClient = null;
            FireConnection(false);
            Log("[INF] 已断开连接");
        }

        public ushort[] ReadHoldingRegisters(ushort startAddress, ushort quantity)
        {
            return ReadRegisters(0x03, startAddress, quantity);
        }

        public ushort[] ReadInputRegisters(ushort startAddress, ushort quantity)
        {
            return ReadRegisters(0x04, startAddress, quantity);
        }

        public bool[] ReadCoils(ushort startAddress, ushort quantity)
        {
            byte[] response = Execute(BuildReadReq(0x01, startAddress, quantity));
            if (response == null) return null;

            bool[] coils = new bool[quantity];
            for (int i = 0; i < quantity; i++)
            {
                coils[i] = ((response[9 + i / 8] >> (i % 8)) & 0x01) == 1;
            }
            return coils;
        }

        public bool WriteSingleRegister(ushort address, ushort value)
        {
            byte[] response = Execute(BuildWriteReq(0x06, address, value));
            if (response == null) return false;
            Log("[OK] 写单寄存器: 地址=" + address + " 值=" + value);
            return true;
        }

        public bool WriteSingleCoil(ushort address, bool value)
        {
            ushort val = value ? (ushort)0xFF00 : (ushort)0x0000;
            byte[] response = Execute(BuildWriteReq(0x05, address, val));
            if (response == null) return false;
            Log("[OK] 写单线圈: 地址=" + address + " 值=" + (value ? "ON" : "OFF"));
            return true;
        }

        public bool WriteMultipleRegisters(ushort startAddress, ushort[] values)
        {
            int len = values.Length;
            byte[] pdu = new byte[6 + len * 2];
            pdu[0] = 0x10;
            pdu[1] = (byte)(startAddress >> 8);
            pdu[2] = (byte)(startAddress & 0xFF);
            pdu[3] = (byte)(len >> 8);
            pdu[4] = (byte)(len & 0xFF);
            pdu[5] = (byte)(len * 2);
            for (int i = 0; i < len; i++)
            {
                pdu[6 + i * 2] = (byte)(values[i] >> 8);
                pdu[7 + i * 2] = (byte)(values[i] & 0xFF);
            }

            byte[] response = Execute(WrapMBAP(pdu));
            if (response == null) return false;
            Log("[OK] 写多寄存器: 地址=" + startAddress + " 数量=" + len);
            return true;
        }

        private ushort[] ReadRegisters(byte func, ushort addr, ushort qty)
        {
            byte[] response = Execute(BuildReadReq(func, addr, qty));
            if (response == null) return null;

            ushort[] values = new ushort[qty];
            for (int i = 0; i < qty; i++)
            {
                values[i] = (ushort)((response[9 + i * 2] << 8) | response[10 + i * 2]);
            }
            string name = (func == 0x03) ? "保持寄存器" : "输入寄存器";
            Log("[OK] 读" + name + ": 地址=" + addr + " 数量=" + qty);
            return values;
        }

        private byte[] BuildReadReq(byte func, ushort addr, ushort qty)
        {
            byte[] pdu = new byte[5];
            pdu[0] = func;
            pdu[1] = (byte)(addr >> 8);
            pdu[2] = (byte)(addr & 0xFF);
            pdu[3] = (byte)(qty >> 8);
            pdu[4] = (byte)(qty & 0xFF);
            return WrapMBAP(pdu);
        }

        private byte[] BuildWriteReq(byte func, ushort addr, ushort val)
        {
            byte[] pdu = new byte[5];
            pdu[0] = func;
            pdu[1] = (byte)(addr >> 8);
            pdu[2] = (byte)(addr & 0xFF);
            pdu[3] = (byte)(val >> 8);
            pdu[4] = (byte)(val & 0xFF);
            return WrapMBAP(pdu);
        }

        private byte[] WrapMBAP(byte[] pdu)
        {
            _transactionId++;
            byte[] frame = new byte[7 + pdu.Length];
            frame[0] = (byte)(_transactionId >> 8);
            frame[1] = (byte)(_transactionId & 0xFF);
            frame[2] = 0; frame[3] = 0;
            frame[4] = (byte)((pdu.Length + 1) >> 8);
            frame[5] = (byte)((pdu.Length + 1) & 0xFF);
            frame[6] = UnitId;
            Array.Copy(pdu, 0, frame, 7, pdu.Length);
            return frame;
        }

        private byte[] Execute(byte[] request)
        {
            lock (_lock)
            {
                try
                {
                    if (_stream == null || !_tcpClient.Connected)
                    {
                        Error("未连接到设备，请先连接");
                        return null;
                    }

                    HexLog("SND", request);
                    _stream.Write(request, 0, request.Length);

                    byte[] header = new byte[7];
                    int offset = 0;
                    while (offset < 7)
                    {
                        int n = _stream.Read(header, offset, 7 - offset);
                        if (n == 0)
                        {
                            Log("[ERR] 连接关闭");
                            Error("连接意外关闭");
                            Disconnect();
                            return null;
                        }
                        offset += n;
                    }

                    int bodyLen = (header[4] << 8) | header[5];
                    byte[] response = new byte[7 + bodyLen];
                    Array.Copy(header, response, 7);

                    offset = 0;
                    while (offset < bodyLen)
                    {
                        int n = _stream.Read(response, 7 + offset, bodyLen - offset);
                        if (n == 0)
                        {
                            Log("[ERR] 连接关闭");
                            Error("连接意外关闭");
                            Disconnect();
                            return null;
                        }
                        offset += n;
                    }

                    HexLog("RCV", response);

                    if (response[7] >= 0x80)
                    {
                        string errMsg = GetErrorMsg(response[8]);
                        Log("[ERR] Modbus异常: " + errMsg);
                        Error("Modbus异常响应: " + errMsg);
                        return null;
                    }
                    return response;
                }
                catch (TimeoutException)
                {
                    Log("[ERR] 通讯超时");
                    Error("通讯超时: PLC 无响应");
                    Disconnect();
                    return null;
                }
                catch (Exception ex)
                {
                    Log("[ERR] 通讯错误: " + ex.Message);
                    Error("通讯异常: " + ex.Message);
                    Disconnect();
                    return null;
                }
            }
        }

        private void HexLog(string tag, byte[] data)
        {
            Log("[" + tag + "] " + BitConverter.ToString(data).Replace('-', ' '));
        }

        private void Log(string msg)
        {
            if (OnLog != null) OnLog(msg);
        }

        private void Error(string msg)
        {
            if (OnError != null) OnError(msg);
        }

        private void FireConnection(bool state)
        {
            if (OnConnectionChanged != null) OnConnectionChanged(state);
        }

        private string GetErrorMsg(byte code)
        {
            switch (code)
            {
                case 0x01: return "非法功能码(01) - PLC不支持该功能";
                case 0x02: return "非法数据地址(02) - 地址超出范围";
                case 0x03: return "非法数据值(03) - 数据值无效";
                case 0x04: return "从站设备故障(04) - PLC操作失败";
                case 0x05: return "确认(05) - PLC正在处理";
                case 0x06: return "从站设备忙(06) - PLC忙碌中";
                case 0x08: return "存储器奇偶错误(08)";
                case 0x0A: return "网关路径不可用(0A)";
                case 0x0B: return "网关目标无响应(0B)";
                default: return "未知错误(" + code.ToString("X2") + ")";
            }
        }

        public void Dispose()
        {
            Disconnect();
        }
    }
}
