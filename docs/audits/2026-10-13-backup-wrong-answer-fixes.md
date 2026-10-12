# 2026-10-13 백업 이미지·자동 오답 연결·수학 기호 경고 수정

## 기준

- 원격 main: `faaaa0fa1196e431077a4a96e0255552068b13e5`.
- 시작점: Draft #147 `5760e281460a3f3951038a0f0e939e307330eb62`.
- 독립 브랜치: `codex/backup-wrong-answer-links`. #147 위의 새 Draft PR로 제출한다.
- 기존 7개 미커밋 UI 수정과 점검 자료는 원래 작업 공간에 보존했다. 이 브랜치에 자동으로 포함하지 않았다.
- 저장 형식 확장/일괄 마이그레이션, 기존 PR 변경/병합, 설치판 교체는 하지 않았다.

## 실제 원인과 변경

### P1 — v1 복원 이미지 손실

v1 복원은 시험·생성 시험·GPT 초안·가져오기 초안·삭제 취소 기록을 유지하면서 이미지 store 전체를 백업 이미지로 대체했다.

`backup.ts`에서 유지할 저장소의 참조를 쓰기 전에 수집한다. 백업 이미지와 기존 참조 이미지를 합쳐 복원하고, 같은 이름의 다른 값은 충돌로 차단한다. 참조의 문법/구조/읽기 오류와 양쪽 모두에 없는 이미지도 쓰기 전에 차단한다. 교체될 기존 항목의 참조는 보존 대상으로 넣지 않는다. `browserImageReferences.ts`의 기본 삭제 보호 동작은 유지하고 내부 옵션으로만 항목 store를 제외한다.

기존 v2 복원과 실패 시 rollback 흐름은 유지한다. 이번 수정의 v1 보존 정책이 Windows ZIP 복원까지 검증됐다고 주장하지 않는다.

### P2 — 자동 오답의 원본·해설 연결 누락

시험 제출은 페이지 파일과 canonical segment를 복사했지만 structured 문항의 source, 확인된 hotspot, 해설창용 정답표를 넘기지 않았다.

`wrongAnswerPresentation.ts`에서 해당 snapshot을 표시용 항목 필드로 변환한다. 문항 번호·section·본문·조건·선택지·수식·segment ID를 유지하며, 부모 시험의 명시적 페이지 맵을 우선해 로컬 페이지 번호를 계산한다. hotspot은 해당 snapshot ID에 속한 유효한 연결만 문항 key로 변환한다. solutionAnswer의 출제 의도와 solutionFigures도 전달한다. 번호가 모호한 snapshot에 정답/점/페이지를 자동 연결하지 않는다.

여러 명시적 페이지는 기존 `supplementalResources.kind=source_pages`, `questionNumbers`, `images` 필드로 보존한다. `questionAssets.ts`, `solutionModel.ts`, `OriginalPageStudyView.tsx`, `examSession.ts`가 같은 연결을 사용한다. 연결 버튼을 만들기 위해 가짜 파란 점을 생성하지 않는다. 명시적 연결이 없는 legacy 전체 페이지 목록은 자동 연결하지 않는다.

일반 시험도 원본 항목 ID와 문항 번호를 추적한다. 생성 시험의 2번과 원문 1번은 기존 출처 기록에서 구분한다. 새로 생성되는 오답부터 적용하며 이미 누락된 오래된 오답을 일괄 재작성하지 않는다. 문자열 원문/주석 좌표는 변경하지 않는다.

### P3 — 정상 프라임 검수 오탐

수식 렌더러는 프라임과 Unicode 위·아래 첨자를 지원하지만 OCR 경고 허용 목록에는 없었다. `suspiciousText.ts`의 깨진 문자 판정·기호 비율·수식 줄 판정을 맞춰 지원하는 프라임, 첨자, 곱 기호를 허용했다. 실제 replacement 문자와 알려진 OCR 오류 경고는 유지한다.

## 회귀 검사와 실행

- 독립 `npm ci --no-audit --no-fund`: 성공, 285개 설치.
- 관련 9개 파일 / 98개 검사 성공. 이후 보완한 3개 파일 / 24개 검사 재실행 성공(고유 사례 합계 100개).
- 자동 오답 연결의 수정 전 hook 실패 2건 확인 후 수정. P1/P3의 수정 전 근거는 재점검 보고서의 수동 재현이며, 이번 회귀 사례로 결과를 고정했다.
- 유지된 5개 참조 store 각각의 이미지 보존, 충돌, 동일 값, 손상/문법 오류, 참조 이미지 누락, 교체 항목의 이미지 제외를 확인했다.
- 일반 3번의 원본 2페이지→로컬 1페이지, 생성 시험 2번/원문 1번, 복수 페이지 재시험 생성, 미연결/중복 번호/다른 문항 hotspot, 해설 그림·출제 의도, 반복 수식·조건 segment 보존을 확인했다.
- 기존 API의 v1 성공 fixture에 `questions: []`를 추가해 정상 참조 store 형태로 맞췄다. 기대값·timeout·skip은 변경하지 않았다.
- 변경 TS/TSX lint: 오류 0, 기존 경고 3개. 마지막 수정 파일 재검사: 오류 0, 기존 경고 1개.
- `npm run build`: 최종 성공. 첫 실행의 검사 파일 optional-field 타입 오류를 수정했다. 기존 chunk 크기/dynamic import 경고 유지.
- `git diff --check`: 성공.
- 메모리 제한에 따라 전체 unit/E2E/Rust/Tauri 재실행은 보류했다. 변경·검사·빌드·직접 사용을 순차 진행했다.

## 직접 사용

- 격리 브라우저 1459에서 실제 PNG 2장 포함 ZIP 업로드→바로 저장→연습 시험→3번 오답 ① 응답→제출→자동 오답 생성.
- 3번 오답에서 원본 이미지 표시, 연결 없음 경고 제거, ‘3번 정답·해설 열기’ 버튼 유지 확인.
- 해당 점으로 정답 ③·3번 해설·분수 수식 표시. 새로고침 후에도 재진입·해설 열기 성공.
- 라이트 모드 1100×750과 680×750에서 해당 연결·해설 화면 확인. 좁은 화면 Escape 후 점으로 포커스 복귀 확인은 초기 기본 테마 실행에서도 성공했다.
- 일반 입력의 `f′(2)`가 정상 렌더링되고 텍스트 검수 배지가 없는 것을 확인했다.
- 수동 진단 페이지에서 실제 이미지 저장 API→v1 복원 API를 실행: beforeImagePresent=true, afterImagePresent=true, examStillPresent=true. 진단 finally에서 이전 격리 데이터 복구 완료. 설정 UI의 백업 파일 선택 전체 흐름을 거친 결과는 아니다.
- 실제 PDF 전체 대조가 아닌 합성 확인용 문항·PNG ZIP이다. Windows/native/proxy·실제 터치는 미확인.
- 점검용 서버와 탭 종료, 임시 진단 HTML 제거. 합성 데이터는 1459의 격리 저장소에만 남는다.

### 화면

- [라이트 원본 연결](evidence-backup-links-2026-10-13/wrong-answer-page-light.png)
- [라이트 정답·해설](evidence-backup-links-2026-10-13/wrong-answer-solution-light.png)
- [680px 라이트 해설](evidence-backup-links-2026-10-13/wrong-answer-solution-light-680.png)
- [v1 복원 이미지 보존](evidence-backup-links-2026-10-13/v1-backup-preserved.png)
- [프라임 렌더링](evidence-backup-links-2026-10-13/prime-rendering.png)

## 남은 범위

이번 세 건은 확인한 브라우저 경로에서 수정됐다. 오래된 연결 누락 오답의 복구, Windows/proxy 직접 사용, 전체 회귀 검사는 별도 확인이 필요하다. #147과 #145의 기존 Draft 의존 관계, 별도 미커밋 UI 수정, entryPaneOverrides/P3 의존성 작업은 유지된다. GitHub CI는 제출한 head 기준으로 별도 기록한다. 전체 검사 보류를 성공으로 대체하지 않으며 Draft 유지/자동 병합하지 않는다.
