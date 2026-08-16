@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo MODE=SOURCE-PREVIEW
where node >nul 2>&1 || (echo [ERROR] Node.js 24 이상이 필요합니다. & exit /b 1)
node scripts\launch-preview.mjs
exit /b %ERRORLEVEL%
