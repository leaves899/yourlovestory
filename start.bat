@echo off
REM 启动 YourCrush 恋爱日记应用
REM 该脚本确保 ELECTRON_RUN_AS_NODE 环境变量不会干扰 Electron 启动

set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0"
echo 启动 YourCrush...
node_modules\electron\dist\electron.exe .
