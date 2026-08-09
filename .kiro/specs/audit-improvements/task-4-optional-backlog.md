# Phase 4 optional backlog

## 4.1 style-src unsafe-inline

`script-src 'unsafe-inline'`는 제거됨. `style-src 'unsafe-inline'`은 KaTeX/런타임 스타일 주입용으로 유지.
제거 시 KaTeX CSS 전략(해시/nonce 또는 외부 stylesheet) 필요.

## 4.2 Clippy -D warnings

Baseline: 14 unique warnings (see `task-3-3-clippy-baseline.md`).
CI는 report mode. `-D warnings` 전환은 경고 일괄 수정 후.
