# 릴리스 절차

1. `npm run version:set -- 1.1.0` 실행
2. `npm run version:check`, `npm run check`, `cargo fmt --check`, `cargo check`, `cargo test` 실행
3. `releases/v1.1.0.md`에 사용자용 변경사항 작성
4. 저장소 밖에서 생성한 private key와 password를 `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` GitHub Secrets에 등록
5. `main` merge SHA에만 `app-v1.1.0` tag를 push합니다. workflow는 tag가 `origin/main`과 다르면 release를 거부합니다.
6. GitHub runner에서 signed NSIS installer, updater zip/signature, `latest.json`을 검증한 뒤에만 release를 공개합니다.

Updater private key를 잃으면 기존 설치본에 호환되는 업데이트를 더 이상 서명할 수 없습니다. Windows Authenticode 인증서는 Tauri updater signature와 별도의 선택 작업입니다.

일반 사용자의 `run.bat`은 설치된 시작 메뉴 바로가기만 실행합니다. source checkout에서 Tauri build를 실행하는 용도는 `run-dev.bat`과 CI뿐입니다.

