@echo off
cd /d "%~dp0"
echo MODE=WEB
where node >nul 2>&1 || (echo [ERROR] Node.js is required. & exit /b 1)
node scripts\launch-web.mjs
exit /b %ERRORLEVEL%
