@echo off
cd /d "%~dp0"
echo MODE=WEB-ISOLATED
set "CARGO_TARGET_DIR=%LOCALAPPDATA%\WrongAnswerNotebookDev\cargo-target"
where node >nul 2>&1 || (echo [ERROR] Node.js is required. & exit /b 1)
node scripts\launch-web.mjs --isolated
exit /b %ERRORLEVEL%
