@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo MODE=INSTALLED
set "START_MENU_SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\오답노트.lnk"

if not exist "%START_MENU_SHORTCUT%" (
  echo [ERROR] 설치된 오답노트를 찾지 못했습니다.
  echo [안내] NSIS 설치 파일로 설치한 뒤 시작 메뉴의 '오답노트'를 실행하세요.
  echo [안내] https://github.com/reda080201/wrong-answer-notebook/releases
  exit /b 1
)

start "" "%START_MENU_SHORTCUT%"
exit /b %ERRORLEVEL%
