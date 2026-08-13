@echo off
cd /d "%~dp0"
echo MODE=TAURI
where node >nul 2>&1 || (echo [ERROR] Node.js is required. & exit /b 1)
where rustc >nul 2>&1 || if exist "%USERPROFILE%\.cargo\bin\rustc.exe" set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
where rustc >nul 2>&1 || (echo [ERROR] Rust is required. Use run-web.bat for web mode. & exit /b 1)
netstat -ano | findstr /R /C:":1420 .*LISTENING" >nul && (echo [ERROR] localhost:1420 is already in use. Check the PID below; no process was stopped. & netstat -ano | findstr :1420 & exit /b 1)
node scripts\sync-dependencies.mjs
if not "%ERRORLEVEL%"=="0" goto dependency_error
call npm run dev:desktop
exit /b %ERRORLEVEL%

:dependency_error
echo [ERROR] Dependency synchronization failed. Desktop startup was cancelled.
exit /b 1
