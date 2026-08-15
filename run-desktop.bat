@echo off
cd /d "%~dp0"
echo MODE=TAURI-RELEASE
where node >nul 2>&1 || (echo [ERROR] Node.js is required. & exit /b 1)
where rustc >nul 2>&1 || if exist "%USERPROFILE%\.cargo\bin\rustc.exe" set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
where rustc >nul 2>&1 || (echo [ERROR] Rust is required. Use run-web.bat for web mode. & exit /b 1)
node scripts\launch-desktop.mjs
exit /b %ERRORLEVEL%
