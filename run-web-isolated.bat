@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo MODE=WEB-ISOLATED
set "VITE_STORAGE_MODE=isolated-browser"
where node >nul 2>&1 || (echo [ERROR] Node.js 24 이상이 필요합니다. & exit /b 1)
node scripts\sync-dependencies.mjs
if not "%ERRORLEVEL%"=="0" (echo [ERROR] Dependency synchronization failed. Web startup was cancelled. & exit /b 1)
call npm run dev:web -- --host 127.0.0.1 --open
exit /b %ERRORLEVEL%
