@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo MODE=TAURI
where node >nul 2>&1 || (echo [오류] Node.js가 필요합니다. & exit /b 1)
where rustc >nul 2>&1 || if exist "%USERPROFILE%\.cargo\bin\rustc.exe" set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
where rustc >nul 2>&1 || (echo [오류] Rust가 필요합니다. Web 모드는 run-web.bat을 사용하세요. & exit /b 1)
netstat -ano | findstr /R /C:":1420 .*LISTENING" >nul && (echo [오류] localhost:1420을 이미 사용 중입니다. netstat -ano ^| findstr :1420으로 PID를 확인하세요. & netstat -ano | findstr :1420 & exit /b 1)
if not exist "node_modules\" call npm install || exit /b 1
call npm run dev:desktop
