@echo off
chcp 65001 >nul
echo ====================================
echo   SiemensModbusTool - 编译脚本
echo ====================================
echo.

set CSC="C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
set REF=/reference:System.dll /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Data.dll /reference:System.Core.dll
set OUT=SiemensModbusTool.exe

echo 编译中...
%CSC% /target:winexe %REF% /out:%OUT% Program.cs MainForm.cs ModbusTcpClient.cs

if %ERRORLEVEL%==0 (
    echo [OK] 编译成功: %OUT%
    echo.
    echo 运行: %OUT%
) else (
    echo [ERROR] 编译失败，错误代码: %ERRORLEVEL%
    pause
)
