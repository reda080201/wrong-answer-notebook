@echo off
chcp 65001 >nul
cd /d "%~dp0"
call "%~dp0run-desktop.bat"
exit /b %ERRORLEVEL%
