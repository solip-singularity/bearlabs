@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 需要先安装 Node.js 18+（https://nodejs.org/）
  pause
  exit /b 1
)
echo 正在启动「计算机知识学习站」本地服务...
start "" cmd /c "timeout /t 2 >nul & start http://127.0.0.1:8642/"
node server\server.js
pause
