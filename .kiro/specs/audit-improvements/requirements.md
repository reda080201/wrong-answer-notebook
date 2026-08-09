# Audit Improvements - Requirements

**Feature**: 감사 보고서 기반 앱 품질 개선
**Type**: 보안, 안정성, 유지보수성, 인프라
**Priority**: P0 (보안/데이터), P1 (구조), P2 (인프라)
**Status**: Requirements Definition

## Overview

2026년 프로젝트 감사 보고서에서 식별된 보안, 데이터 안정성, 코드 구조, 인프라 이슈를 체계적으로 해결한다.

## User Stories

### P0: Critical - 보안 및 데이터 안정성

#### US-P0-1: Library Folders 데이터 안정성
**As a** 사용자  
**I want** 폴더 변경 직후 앱을 종료해도 폴더 구조가 손실되지 않기를  
**So that** 라이브러리 폴더 조직이 항상 안전하게 저장됨

**Acceptance Criteria**:
- [ ] `flushPendingAppWrites`에 library folders flush 추가
- [ ] 또는 library persistence가 별도 메커니즘이라면 문서화 + race condition 검증
- [ ] Window close guard가 library 변경을 감지하고 flush
- [ ] 15초 timeout 내에 library flush 완료

**Dependencies**: 
- Library folders persistence 메커니즘 조사 필요

#### US-P0-2: CSP Script Injection 방어
**As a** 보안 엔지니어  
**I want** CSP에서 unsafe-inline을 제거하여 XSS → RCE 경로를 차단  
**So that** 웹뷰 XSS가 전체 Tauri 명령 실행으로 확대되지 않음

**Acceptance Criteria**:
- [ ] `tauri.conf.json`의 CSP에서 `script-src 'unsafe-inline'` 제거
- [ ] Vite 빌드가 nonce 또는 hash 기반 CSP 생성
- [ ] KaTeX 등 인라인 스크립트 의존 컴포넌트를 외부 스크립트로 변환
- [ ] 모든 인라인 이벤트 핸들러를 addEventListener로 변환
- [ ] Dev/prod 모드에서 CSP 위반 없이 앱 정상 동작

**Technical Notes**:
- Vite plugin-csp 또는 수동 nonce injection 고려
- React 19의 inline handler는 이미 DOM API 사용 (확인 필요)

#### US-P0-3: Filesystem Capability 최소화
**As a** 보안 엔지니어  
**I want** 불필요한 filesystem write 권한을 제거  
**So that** XSS 공격자가 임의 파일 쓰기를 할 수 없음

**Acceptance Criteria**:
- [ ] `capabilities/default.json`에서 `fs:allow-appdata-write-recursive` 제거 시도
- [ ] FE가 `@tauri-apps/plugin-fs` 사용하는지 확인 (grep)
- [ ] 사용하지 않으면 제거, 사용하면 필요한 최소 경로만 허용
- [ ] Tauri 앱 실행 및 백업/복원/이미지 저장 등 기능 정상 동작 확인

**Investigation Required**:
- FE에서 실제로 plugin-fs 사용하는지 확인
- Rust 백엔드만 fs 접근하면 capability 불필요

#### US-P0-4: Image Save 경로 검증 강화
**As a** 보안 엔지니어  
**I want** `save_image` 명령이 임의 경로 읽기를 방지  
**So that** XSS를 통한 파일 시스템 탐색을 차단

**Acceptance Criteria**:
- [ ] `save_image(source_path)` 인자를 절대경로 대신 dialog 선택으로 변경
- [ ] 또는 source_path를 canonicalize하고 allowed prefix 검증
- [ ] 백업 복원의 `selectBackupSource`도 동일하게 검증
- [ ] Path traversal 시도 시 에러 반환
- [ ] 기존 이미지 저장 워크플로우 정상 동작

**Technical Notes**:
- 현재 validate_image_magic은 파일 내용만 검증
- 경로 자체의 안전성은 미검증

### P1: High - 코드 구조 및 유지보수성

#### US-P1-1: Settings Modal Props Drilling 해소
**As a** 개발자  
**I want** SettingsModal의 57개 props를 Context/Controller로 통합  
**So that** 설정 관련 코드 변경이 쉬워짐

**Acceptance Criteria**:
- [ ] `SettingsContext` 생성 (theme, ai, view, exam, images, gpt-mcp, chatgpt, data, templates, advanced, updates)
- [ ] `useSettingsController` hook 생성 (모든 patch 함수 통합)
- [ ] SettingsModal이 Context에서 상태/함수 가져옴
- [ ] App.tsx의 settings 관련 props 전달 제거
- [ ] 기존 모든 설정 기능 정상 동작

**Impact**:
- SettingsModal.tsx: ~815줄, props 57개 → Context 사용
- App.tsx에서 settings 배선 간소화

#### US-P1-2: useAppActions 테스트 커버리지
**As a** 개발자  
**I want** useAppActions의 핵심 로직에 단위 테스트 추가  
**So that** 명령 facade 변경 시 회귀를 조기 발견

**Acceptance Criteria**:
- [ ] `useAppActions.test.ts` 생성
- [ ] handleSave, handleImportedEntriesApply, applySupplementalMerge 테스트
- [ ] handleBackup, handleRestore 에러 시나리오 테스트
- [ ] Review 관련 로직 (handleReview, startReview) 테스트
- [ ] 최소 70% 라인 커버리지

**Dependencies**:
- Mock 전략 결정 (useEntries, useSettings 등)

#### US-P1-3: Feature 추출 완료
**As a** 개발자  
**I want** EntryForm, EntryDetail, ImportFromGptModal을 features로 이동  
**So that** components 폴더가 순수 UI만 담음

**Acceptance Criteria**:
- [ ] `features/entries/` 생성하고 EntryForm, EntryDetail 이동
- [ ] `features/import/` 생성하고 ImportFromGptModal 이동
- [ ] Import 경로 자동 업데이트 (smart_relocate 또는 수동)
- [ ] 모든 컴포넌트 정상 동작
- [ ] 빌드 성공

**Size Estimates**:
- EntryForm: ~1,200줄
- EntryDetail: ~2,100줄
- ImportFromGptModal: ~1,500줄

### P2: Medium - 인프라 및 개발자 경험

#### US-P2-1: Package.json Engines 필드
**As a** 개발자  
**I want** package.json에 engines 필드 추가  
**So that** Node.js 24 미만 환경에서 설치 시 경고

**Acceptance Criteria**:
- [ ] `"engines": { "node": ">=24.0.0" }` 추가
- [ ] npm install 시 Node 24 미만에서 경고
- [ ] CI와 README 일치

#### US-P2-2: Version Check를 로컬 Check에 추가
**As a** 개발자  
**I want** `npm run check`에 `version:check` 포함  
**So that** 로컬에서 버전 불일치 조기 발견

**Acceptance Criteria**:
- [ ] package.json `check` 스크립트에 `npm run version:check` 추가
- [ ] 로컬 실행 시 버전 불일치 감지
- [ ] CI와 동일한 검증

#### US-P2-3: Rust Clippy 추가
**As a** Rust 개발자  
**I want** CI에 clippy 린트 추가  
**So that** Rust 코드 품질이 자동 검증됨

**Acceptance Criteria**:
- [ ] `.github/workflows/ci.yml`의 rust job에 clippy 단계 추가
- [ ] `cargo clippy -- -D warnings` (경고를 에러로)
- [ ] 또는 `cargo clippy` (경고만)
- [ ] 현재 코드가 clippy 통과

#### US-P2-4: E2E 스모크 테스트 기반
**As a** QA 엔지니어  
**I want** 1-3개 핵심 시나리오의 E2E 테스트  
**So that** 주요 워크플로우 회귀를 자동 감지

**Acceptance Criteria**:
- [ ] Playwright 설정 (Tauri 앱 대상)
- [ ] E2E 1: 앱 시작 → 항목 생성 → 저장
- [ ] E2E 2: 백업 생성 → 복원
- [ ] E2E 3: 설정 변경 → 재시작 후 유지
- [ ] CI에 e2e job 추가 (선택적)

**Technical Notes**:
- Tauri는 WebDriver 또는 Playwright 통합 지원
- 초기에는 수동 실행 가능

## Business Rules

### BR-1: Backward Compatibility
모든 변경은 기존 데이터 파일(`entries.json`, `settings.json`, `library-folders.json`)과 호환되어야 함.

### BR-2: Zero Downtime Migration
CSP, capability 변경은 점진적 적용 가능해야 하며, 한 번에 전부 바꾸면 앱이 동작하지 않을 수 있음.

### BR-3: Security First
P0 보안 이슈는 P1/P2보다 우선하며, trade-off 발생 시 보안을 택함.

### BR-4: Test Before Merge
P1-2 (useAppActions 테스트)는 P1-3 (feature 추출) 전에 완료하여 리팩토링 안전망 확보.

## Non-Functional Requirements

### NFR-1: Performance
- Library flush 추가가 close timeout (15초)를 초과하지 않음
- CSP 변경이 앱 로딩 시간을 10% 이상 증가시키지 않음

### NFR-2: Maintainability
- Feature 추출 후 components 폴더가 1,000줄 이하 파일만 포함
- Context/Controller 패턴이 일관되게 적용됨

### NFR-3: Security
- CSP 위반 0개 (dev/prod)
- Capability는 필요 최소한만 허용
- 모든 경로 인자는 검증 또는 dialog 선택

### NFR-4: Developer Experience
- 로컬 check가 CI와 동일한 검증 수행
- Clippy 경고가 코드 리뷰 전 해결됨

## Out of Scope

### What We're NOT Doing
- **완전한 E2E 커버리지**: 초기에는 1-3개 스모크 테스트만
- **모든 Component 테스트**: useAppActions만 집중
- **전체 Feature 추출**: EntryForm/Detail/ImportGpt만 이동
- **Coverage 임계치**: 아직 임계치 설정하지 않음
- **OS 매트릭스 확장**: Windows only 유지

### Deferred to Future
- EntryForm 컴포넌트 분리 (현재 ~1,200줄 단일 파일)
- mcp_bridge.rs 모듈 분리 (현재 ~2,000줄)
- 전체 test coverage 임계치 설정
- macOS, Linux CI 추가

## Dependencies

### External Dependencies
- Vite CSP plugin (또는 수동 nonce) 조사 필요
- Playwright Tauri integration 확인

### Internal Dependencies
- Library folders persistence 메커니즘 이해 필요
- FE의 plugin-fs 사용 여부 확인 필요
- 현재 Rust 코드의 clippy 경고 수준 확인 필요

## Success Metrics

### P0 Success Criteria
- [ ] Library 변경 후 즉시 종료 시 데이터 손실 0%
- [ ] CSP unsafe-inline 제거 후 XSS → RCE 경로 차단
- [ ] fs:allow-appdata-write-recursive 제거 또는 정당화
- [ ] save_image 경로 traversal 시도 차단

### P1 Success Criteria
- [ ] SettingsModal props 수: 57 → 10 미만
- [ ] useAppActions 테스트 커버리지: 0% → 70%+
- [ ] components 폴더 대형 파일: 3개 → 0개

### P2 Success Criteria
- [ ] engines 필드 존재
- [ ] 로컬 check에 version:check 포함
- [ ] CI에 clippy 포함
- [ ] E2E 테스트 1-3개 존재

## Risk Assessment

### High Risk
- **CSP 변경**: 인라인 스크립트 의존 컴포넌트 발견 시 대규모 리팩토링 필요
- **Feature 추출**: Import 경로 대규모 변경으로 merge conflict 위험

### Medium Risk
- **Library flush**: 별도 메커니즘이면 복잡도 증가
- **Capability 축소**: 숨겨진 fs 사용처 발견 시 앱 동작 불가

### Low Risk
- **Engines 추가**: 설정 변경만
- **Version check 추가**: 스크립트 수정만
- **Clippy 추가**: CI 설정만

## Open Questions

1. **Library Persistence**: useLibraryFolders가 자체 저장 메커니즘을 갖고 있는가, 아니면 flushPendingAppWrites 통합이 필요한가?
2. **FE plugin-fs Usage**: 프론트엔드가 실제로 `@tauri-apps/plugin-fs`를 import하는가?
3. **CSP Inline Scripts**: KaTeX, 차트, 또는 다른 라이브러리가 런타임 인라인 스크립트를 생성하는가?
4. **Clippy Baseline**: 현재 Rust 코드베이스의 clippy 경고 수는?
5. **Playwright Tauri**: Playwright가 Tauri WebView를 제어할 수 있는가, 별도 도구 필요한가?

## References

- Original Audit Report: `PROJECT_AUDIT_REPORT.md` (또는 사용자 제공 원문)
- Tauri Security Best Practices: https://tauri.app/v2/learn/security/
- Vite CSP: https://vitejs.dev/guide/features.html#content-security-policy-csp
- Playwright Tauri: https://github.com/tauri-apps/tauri/discussions (검색 필요)
