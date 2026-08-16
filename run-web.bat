@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo MODE=WEB
echo [INFO] Shared desktop storage preview mode. For an isolated sandbox use run-web-isolated.bat.
call "%~dp0run-preview.bat"
exit /b %ERRORLEVEL%
