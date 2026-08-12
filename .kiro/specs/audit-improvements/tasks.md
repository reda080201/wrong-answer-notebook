# Audit Improvements - Tasks

## Overview

감사 보고서 기반 앱 품질 개선. 총 25개 태스크를 4개 페이즈(4주)에 걸쳐 실행합니다.

**Status**: Executed (2026-08-09)  
**Estimated Total**: 4 weeks (20 days)

## Tasks

### Phase 1: P0 Critical Security & Data Safety

- [x] 1.1 Library Folders Persistence Investigation (0.5 day)
- [x] 1.2 Integrate Library Flush into Close Guard (0.5 day)
- [x] 1.3 Audit Frontend Filesystem Usage (0.25 day)
- [x] 1.4 Remove or Scope Filesystem Capability (0.5 day)
- [x] 1.5 Audit Inline Scripts for CSP (0.5 day)
- [x] 1.6 Implement CSP Nonce or Hash (1 day) — external `theme-boot.js` + remove script-src unsafe-inline
- [x] 1.7 Create save_image_from_dialog Command (0.75 day)
- [x] 1.8 Update Frontend to Use Dialog Command (0.5 day)
- [x] 1.9 P0 Integration Test & Security Audit (0.5 day)

### Phase 2: P1 Structure & Maintainability

- [x] 2.1 Create SettingsContext (1 day)
- [x] 2.2 Migrate SettingsModal to Context (0.75 day) — props → `onClose` / `initialTab` / `dataActions` / `updateActions`
- [x] 2.3 Create useAppActions Test Suite (2 days)
- [x] 2.4 Extract Entries Feature (1 day)
- [x] 2.5 Extract Import Feature (0.75 day)
- [x] 2.6 P1 Integration Test (0.5 day)

### Phase 3: P2 Infrastructure & DX

- [x] 3.1 Add Package.json Engines (0.1 day)
- [x] 3.2 Add Version Check to Local (0.1 day)
- [x] 3.3 Check Clippy Baseline (0.25 day) — 14 unique warnings
- [x] 3.4 Add Clippy to CI (Report Mode) (0.25 day)
- [x] 3.5 Setup Playwright for E2E (1 day)
- [x] 3.6 Create E2E Smoke Tests (1.5 days)
- [x] 3.7 P2 Integration & Documentation (0.5 day)

### Phase 4: Hardening & Cleanup

- [ ] 4.1 Remove CSP Fallback (0.25 day, optional) — `style-src 'unsafe-inline'` kept for KaTeX
- [ ] 4.2 Fix Rust Clippy Warnings (1-2 days, optional) — baseline documented, not enforced
- [x] 4.3 Add E2E to CI (0.5 day)
- [x] 4.4 Deprecate Old save_image (0.25 day)
- [x] 4.5 Final Integration Test & Sign-off (0.5 day) — `tsc -b` clean; critical unit suites green

## Success Metrics

- [x] Library: flush wired into close guard
- [x] CSP: script-src unsafe-inline removed
- [x] Capability: fs write-recursive removed
- [x] Path: save_image_from_dialog in use
- [x] Settings: Modal props reduced to 4
- [x] Tests: useAppActions suite present
- [x] Components: EntryForm/EntryDetail/Import extracted
- [x] Engines: Field exists
- [x] Check: version:check included
- [x] CI: Clippy + E2E jobs exist
- [x] E2E: smoke.spec.ts exists
