@echo off
chcp 65001 >nul
echo Starting Siemens HMI Server...
start "" "C:\Users\Lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "D:\Ai_5_VS\SiemensHMI\server.js"
timeout /t 2 /nobreak >nul
start "" "http://localhost:3001"
echo HMI Server running at http://localhost:3001
echo Close this window to stop the server.
pause
