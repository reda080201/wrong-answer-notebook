@echo off
cd /d "%~dp0"
echo MODE=WEB-ISOLATED
where node >nul 2>&1 || (echo [ERROR] Node.js is required. & exit /b 1)
call npm run dev:isolated
exit /b %ERRORLEVEL%
