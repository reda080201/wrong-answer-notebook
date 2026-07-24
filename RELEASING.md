# 릴리스 절차

1. `npm run version:set -- 1.1.0` 실행
2. `npm run version:check`, `npm run check`, `cargo fmt --check`, `cargo check`, `cargo test` 실행
3. `releases/v1.1.0.md`에 사용자용 변경사항 작성
4. 저장소 밖에서 생성한 private key를 `TAURI_SIGNING_PRIVATE_KEY` GitHub Secret에 등록
5. `app-v1.1.0` tag push 후 Release asset과 `latest.json` 검증

Updater private key를 잃으면 기존 설치본에 호환되는 업데이트를 더 이상 서명할 수 없습니다. Windows Authenticode 인증서는 Tauri updater signature와 별도의 선택 작업입니다.

