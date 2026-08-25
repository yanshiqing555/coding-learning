using System;
using System.IO;
using System.Windows.Forms;
namespace SiemensModbusTool {
    static class Program {
        [STAThread] static void Main() {
            try { Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false); new MainForm(); File.WriteAllText("D:\\Ai_5_VS\\dbg.txt", "OK"); }
            catch (Exception ex) { File.WriteAllText("D:\\Ai_5_VS\\dbg.txt", ex.GetType().Name + "\n" + ex.Message); }
        }
    }
}
