# Contributing

## 로컬 검증

```bash
npm run check
```

`check`에는 `version:check`, lint, 계약 검사, 단위 테스트, 프론트엔드 빌드가 포함됩니다.

## E2E smoke

```bash
npx playwright install chromium
npm run test:e2e
```

Vite 브라우저 모드 기준 smoke입니다. Tauri 웹뷰 전용 런처는 이후 확장할 수 있습니다.

## Rust

```bash
cd src-tauri
cargo fmt --check
cargo clippy --all-targets --all-features
cargo test
```

Clippy는 CI에서 report 모드로 실행됩니다(`-D warnings`는 아직 강제하지 않음).
