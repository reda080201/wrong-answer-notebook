@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo MODE=WEB
where node >nul 2>&1 || (echo [오류] Node.js가 필요합니다. & exit /b 1)
netstat -ano | findstr /R /C:":1420 .*LISTENING" >nul && (echo [오류] localhost:1420을 이미 사용 중입니다. & netstat -ano | findstr :1420 & exit /b 1)
if not exist "node_modules\" call npm install || exit /b 1
start "" cmd /c "timeout /t 2 >nul && start http://localhost:1420"
call npm run dev:web
