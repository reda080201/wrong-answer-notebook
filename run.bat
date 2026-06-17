@echo off
chcp 65001 >nul
title 오답노트
cd /d "%~dp0"

echo ========================================
echo   오답노트 실행
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [오류] Node.js가 설치되어 있지 않습니다.
    echo https://nodejs.org 에서 설치해 주세요.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo 의존성 설치 중...
    call npm install
    if errorlevel 1 (
        echo [오류] npm install 실패
        pause
        exit /b 1
    )
    echo.
)

where rustc >nul 2>&1
if errorlevel 1 (
    if exist "%USERPROFILE%\.cargo\bin\rustc.exe" (
        set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
    )
)

where rustc >nul 2>&1
if errorlevel 1 (
    echo Rust가 없어 브라우저 모드로 실행합니다.
    echo ^(데스크톱 앱: Rust 설치 후 다시 실행^)
    echo   https://www.rust-lang.org/tools/install
    echo.
    echo http://localhost:1420
    echo.
    start "" cmd /c "timeout /t 2 >nul && start http://localhost:1420"
    call npm run dev
) else (
    echo Tauri 데스크톱 앱 실행 중...
    echo.
    call npm run tauri dev
)

if errorlevel 1 (
    echo.
    echo [오류] 실행 중 문제가 발생했습니다.
    pause
    exit /b 1
)

pause
