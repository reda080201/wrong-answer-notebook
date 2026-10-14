# 문항 표시·시험 화면·상태 안내 14건 수정

## 기준과 범위

- 기준 main: `cbe7f13d41cf4867366e91d684479013a8932591`.
- #151은 미병합 Draft이고 head는 `c32987414e37cd601950ab8067314a25875f0a10`이었다. 이 head에서 독립 작업 공간과 `codex/study-content-ux-followup` 브랜치를 만들었다. 최신 main 병합은 이미 반영된 상태였다.
- 이 후속 PR에는 #151 변경도 포함된다. #151 자체는 수정하거나 병합하지 않았다.
- 독립 `npm ci --no-audit --no-fund`로 285개 패키지를 설치했다. 사용자 기본 폴더의 미커밋 변경과 데스크톱 앱 데이터는 보존했다.
- 항목·시험·백업의 공개 저장 형식과 Tauri 명령을 변경하지 않았다. 문제 은행의 presentation은 저장되지 않는 내부 표시용 정보다.
- 전체 unit·E2E·Rust·Tauri 검사는 메모리 제약에 따라 보류했다. 이번 작업에서 자동 테스트를 추가하거나 실행하지 않았다. 기준 #151에 이미 있던 테스트 파일은 그대로 포함된다.

## 수정 내용과 직접 확인

| ID | 원인 → 수정 | 직접 확인 결과 |
| --- | --- | --- |
| F01 | 복습은 호환 문자열, 문제 은행은 본문·선택지만 읽음 → 정규화한 canonical segment·선택지·연결 그림을 공통 QuestionContentView에 전달 | 실제 시험 결과에서 오답 복습을 열어 그림 1개·표 1개·prime 수식과 본문 순서를 확인. 문제 은행 상세에서 별도 Σ 식, 그림·표 표시 확인 |
| F02 | 크게 보기의 legacy 어댑터가 figure·table을 버림 → 유일하게 대응되는 canonical 문항과 선택지를 전달하고 기존 AnnotatableQuestion 사용 | 크게 보기에서 그림→다음 문장→수식→표→선택지 순서 유지. DOM table 1개, 로드된 JPEG 1개 확인 |
| F03 | 생성 시험 번호와 원문 본문의 번호를 합집합으로 복구함 → 일관된 단일 생성 snapshot의 번호를 기준으로 판정 | 원문 1번을 생성 시험 3번으로 새로 풀고 틀리게 제출. 자동 오답은 3번 한 문항이고 정답③·Σ 식 유지. 기존 문제 데이터에서도 가짜 복구 문항의 출처를 확인할 수 있는 경우 표시가 1문항으로 복구됨 |
| F04 | 절대 위치의 이력 버튼이 설정을 덮음 → 툴바의 실제 배치에 포함하고 반응형 열 수 조정 | 시험 이력 1개/2개인 화면에서 포인터로 설정 창을 정상 열고 이력도 독립 실행 |
| F05 | Dialog 480px와 내부 최소 2열 폭 충돌 → 전용 폭·본문 스크롤·좁은 화면 1열 명시 | 1100px에서 dialog 오른쪽1068 안에 목록 오른쪽1027. 680px에서 1열, clientWidth=scrollWidth=622. 편집 저장 정상 |
| F06 | 실전 원본 컨테이너의 기본 가로 flex에 결과와 reader가 나란히 눌림 → 세로 배치와 reader 최소 공간 확보 | 680px 결과 폭646px, 1100px 결과 폭726px. 2문항 응답·제출 후 결과·필터·해설 정상 표시 |
| F07 | 시작창·생성 시험이 답안지 열림을 항상 저장하고 원본 기본값은 전체 맞춤 → 좁은 창의 새 세션 기본 접힘·너비 맞춤과 최소 읽기 공간 적용 | 680px 새 실전 시작창에서 답안지 열기 기본 해제. 원본100%, 실제 이미지 너비622px. 답안지를 펼쳐 응답2개 입력·제출 성공 |
| F08 | 필터는 버튼 목록에만 적용되고 상세는 현재 인덱스를 계속 사용 → 필터 밖 상세/문제지 숨김, 빈 상태·선택 안내 제공 | 일반 시험의 미응답0 상태에서 ‘미응답 문항이 없습니다’ 표시, 이전 2번 상세와 문제지가 남지 않음. 실전에도 동일 정책 적용 |
| F09 | 공개 동의 identity에 공유 옵션이 없음 → 전체 preferences를 동의 범위에 포함 | 정답 허용 후 ‘내 답’ 변경 시 정답·해설 체크 해제, 프롬프트에서 정답·해설 제거. 실제 복사 문자열에도 정답②가 없음. 클립보드 원복 |
| F10 | localStorage만 검사해 IndexedDB 그림을 누락으로 판단 → 본문을 읽지 않는 이미지 키 목록과 공통 보호 참조 수집기 사용 | 같은 데이터의 검사에서 문제 없음. 실제 백업 생성→복원 완료→검사→새로고침 후 그림1·표1·조건1 유지. 모든 이슈를 표시하도록 8개 제한 제거 |
| F11 | 문항 선택이 article onClick뿐임 → native button·선택 상태·focus-visible 제공 | 첫 카드에서 Tab→Enter로 두 번째 문항 선택, 편집기 본문이 ‘2번째 문항 본문’으로 바뀜 |
| F12 | 조건을 라벨 없이 legacy 필드로 투영해 새 보충 문장으로 판단 → 라벨을 보존해 투영하고 유일한 조건 투영만 대응 | 기존 작업실 저장 결과의 조건이 일반·크게 보기·복습·은행에서 1회 표시. 복원·새로고침 후에도1회. 새 작업실 저장 투영은 코드 검토로 확인 |
| F13 | 연결 API resolve를 무조건 성공으로 안내 → listening/connected 상태를 확인하고 lastError 전달 | 질문 창·설정 모두 ‘브라우저 모드에서는 로컬 MCP 브리지를 사용할 수 없습니다’ 표시. 모순된 성공 안내 없음 |
| F14 | 정상 그리스 문자가 허용 목록에서 빠짐 → Greek 문자와 수학 줄 판정 보완 | 기존 θ 문제의 깨진 문자 안내가 사라짐. 임시로 넣은 실제 손상 문자 �는 검수2건으로 검출. 확인 후 �를 제거하고 저장 |

## 주요 변경 파일

- 문항 식별: `questionCanonical.ts`, `entryQuestions.ts`.
- 표시 연결: `ReviewPanel.tsx`, `AnnotatableQuestion.tsx`, `QuestionTheaterView.tsx`, `EntryDetail.tsx`, 문제 은행 model/build/detail.
- 조건 투영: `importWorkspace.ts`, `questionPresentation.ts`.
- 화면: `App.tsx`, `AppToolbar.tsx`, 시험 view/reader/layout helper, 관련 CSS, `ImportWorkspaceView.tsx`.
- 공유·안내: `ChatGptHelpLauncher.tsx`, `useMcpBridgeSettings.ts`, `suspiciousText.ts`.
- 이미지 검사: `browserImageStore.ts`, `integrity.ts`, `useAppActions.ts`, `SettingsOperationalPanels.tsx`.

## 데이터 보호와 호환성

- 원문 번호가 포함된 본문은 변경하지 않는다. 생성 오답의 canonical 번호와 출처를 분리해 표시한다.
- 기존에 저장된 복구 문항을 일괄 삭제하지 않는다. 자동 복구 경고가 있고 별도 답안·메타·canonical 연결이 없는 경우만 표시 범위를 생성 문항으로 제한한다. 사용자 메타가 있거나 연결이 모호하면 기존 내용을 유지한다.
- legacy 다문항 복구와 단일 canonical key fallback을 유지한다. 번호가 모호한 복습 문항에는 연결 확인 안내를 표시한다.
- canonical segment의 순서와 ID를 유지하고 legacy 조건 투영만 대응한다. canonical에 의도적으로 반복된 문장·수식은 제거하지 않는다.
- 크게 보기에서 기존 주석의 원문 좌표를 실제 entry.question으로 읽고, 새 주석은 기존 canonical 앵커 형식을 사용한다. 모호한 주석은 기존 원문 주석 보기를 제공한다. 이번에는 주석 작성·삭제를 직접 재검증하지 않았다.
- 저장된 답안지 상태와 페이지 선택은 새 반응형 기본값으로 덮어쓰지 않는다. 원본 페이지 이미지를 재작성하지 않는다.
- 이미지 목록 읽기는 쓰기 대기열과 순서를 맞추고 transaction 완료를 기다리며 DB를 finally에서 닫는다. base64 본문 전체를 로드하거나 검사 과정에서 legacy 이미지를 이전하지 않는다.
- 저장소·참조 읽기에 실패하면 검사 실패를 안내한다. native/proxy 환경에서 localStorage 검사로 대체해 잘못된 성공을 보고하지 않는다. 기존 삭제·정리 보호 동작은 변경하지 않았다.
- 복사·MCP·ChatGPT 열기는 독립 버튼으로 유지하며 동의를 초기화하는 동작이 자동 전송을 실행하지 않는다.

## 최소 검사

| 검사 | 결과 |
| --- | --- |
| 독립 npm ci | 성공, 285개 패키지 |
| 변경 TS/TSX ESLint | 오류0, effect 관련 기존 경고14개 유지 |
| 최종 안전 판정 파일 ESLint | 오류0 |
| TypeScript | build의 tsc -b 포함, 성공 |
| 최종 npm run build | 성공. 기존 큰 chunk와 dynamic/static import 경고 유지 |
| git diff --check | 성공 |
| 전체 unit·E2E·계약·Rust·Tauri | 이번 로컬 작업에서는 보류 |

검사 skip·기대값 완화·timeout 증가를 하지 않았다. 자동 테스트 미실행을 통과로 표시하지 않는다. 마지막 직접 확인 후 추가한 ‘복구 문항에 사용자 메타가 있으면 제외하지 않기’와 ‘시험·초안 전용 누락 이미지도 보고하기’의 보수적 분기는 린트·빌드·코드 검토로 확인했으며 별도 장애 사례를 직접 주입하지 않았다.

## 화면 증거

모든 자료는 격리 브라우저 `127.0.0.1:1461`의 확인용 문항이다. 실제 교재 전체를 대조한 결과가 아니다.

- [새 생성 시험 제출 후 단일3번 오답](assets/2026-10-14-study-content-ux/generated-new-submission.png)
- [크게 보기의 그림·표·수식](assets/2026-10-14-study-content-ux/theater-canonical.png)
- [복습의 canonical 내용](assets/2026-10-14-study-content-ux/review-canonical.png)
- [문제 은행의 별도 Σ 식](assets/2026-10-14-study-content-ux/question-bank-equation.png)
- [1100px 실전 결과](assets/2026-10-14-study-content-ux/real-results-desktop.png)
- [680px 원본 너비622px](assets/2026-10-14-study-content-ux/real-readable-narrow.png)
- [빈 결과 필터](assets/2026-10-14-study-content-ux/empty-filter.png)
- [넓은 텍스트 검수창](assets/2026-10-14-study-content-ux/text-review-wide.png)
- [좁은 텍스트 검수창](assets/2026-10-14-study-content-ux/text-review-narrow.png)
- [작업실 키보드 선택](assets/2026-10-14-study-content-ux/workspace-keyboard.png)
- [공유 동의 초기화](assets/2026-10-14-study-content-ux/share-consent-reset.png)
- [MCP 오류 일치](assets/2026-10-14-study-content-ux/mcp-consistent-error.png)
- [복원 후 이미지 무결성 정상](assets/2026-10-14-study-content-ux/restore-integrity-clean.png)

## 남은 제한

- 확인용 문항에서는 보고된14건의 수정 동작을 확인했다. 새 P0 또는 P1을 직접 재현하지 못했지만 프로젝트 전체에 문제가 없다는 판정은 아니다.
- 실제 PDF 전체, Windows native/proxy, 실제 터치·스크린 리더, 주석 작성·삭제, 손상·동시 쓰기 장애 경로는 미확인이다. 마지막 두 보수적 분기는 위에 별도 표시했다.
- 1100×750과680×750을 직접 사용했다. 1024px 전체 흐름을 별도 재실행하지 않았다.
- 남은 P2 위험: 전체 회귀 검사를 보류했으므로 기존 자동 검사와의 계약 차이·드문 연결 모호성은 추가 확인이 필요하다.
- P3: 기존 ESLint 경고14개, 큰 번들, 낮은 우선순위의 라벨 중복과 생성 CTA 발견성, 의존성 및 entryPaneOverrides 정리는 별도 작업이다.
- 임시 손상 문자를 제거했고 클립보드를 원복했다. 서버·에이전트 탭·viewport를 정리했다. 격리 확인용 데이터·초안·백업은 재현을 위해 보존했다.
- 새 Draft로 제출하고 병합·설치판 교체는 하지 않는다. **전체 검증을 보류했으므로 Merge-ready NO**다. GitHub CI 상태는 PR의 동일 head 결과와 별도로 보고한다.
