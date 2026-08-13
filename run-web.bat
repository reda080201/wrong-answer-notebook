@echo off
cd /d "%~dp0"
echo MODE=WEB
where node >nul 2>&1 || (echo [ERROR] Node.js is required. & exit /b 1)
netstat -ano | findstr /R /C:":1420 .*LISTENING" >nul && (echo [ERROR] localhost:1420 is already in use. Check the PID below; no process was stopped. & netstat -ano | findstr :1420 & exit /b 1)
node scripts\sync-dependencies.mjs
if not "%ERRORLEVEL%"=="0" goto dependency_error
start "" cmd /c "timeout /t 2 >nul && start http://localhost:1420"
call npm run dev:web
exit /b %ERRORLEVEL%

:dependency_error
echo [ERROR] Dependency synchronization failed. Web startup was cancelled.
exit /b 1
