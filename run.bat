@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo MODE=TAURI
call "%~dp0run-desktop.bat"
