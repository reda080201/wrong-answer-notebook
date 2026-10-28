# PR168 30문항·8그림 왕복 검증 범위 기록

## 범위와 자료

- 검증 의도: 공개 합성 데이터만 사용해 원본-only 가져오기와 Python CLI ZIP의 30문항·8그림 보존을 비교하고, Import 저장·재진입·백업·복원을 확인한다.
- 사용자 제공/비공개 ZIP 및 실제 API는 사용하지 않았다.
- 현재 저장소의 재사용 가능한 E2E 자료는 `e2e/fixtures/diagram-pipeline-v7.zip` (3문항·3그림) 및 `e2e/fixtures/vision-pipeline-v8.zip` (1문항·1그림)이다. `e2e/fixtures/syntheticLifecycle.ts`는 30문항이지만 그림이 없다. 따라서 이 자료들로는 요청한 30/8 parity를 입증할 수 없다.
- 기존 `e2e/diagram-pipeline.spec.ts`는 CLI ZIP의 검수 비교·사용자 선택·Import 바로 저장·새로고침 후 저장 상태를 확인한다. 기존 테스트의 재진입 검증은 전체 OS 재시작이나 백업/복원을 포함하지 않는다.
- `src/features/import/vision/visionJob.ts`의 `prepareOriginalVisionImport`는 페이지 원본에서 crop을 생성하고 figure representation 기본값을 `original`로 둔다. `tools/diagram_pipeline/vision_adapter.py`의 `preserve_original` 전략도 CLI 경로에서 `method: original`로 매핑한다. 이는 코드 경로의 정적 연결 확인이며, 30/8 산출물의 parity 실행 결과는 아니다.

## 실행 시도

- 단일 기존 통합 흐름만 1회 실행 시도: `npx playwright test e2e/diagram-pipeline.spec.ts --grep "real CLI PNG package preserves comparison, choice and reload at 1100px" --workers=1 --retries=0`.
- **실패, 앱 테스트 본문 시작 전**: Playwright webServer 준비 도중 의존성 동기화가 `node_modules/@esbuild/win32-x64/esbuild.exe`를 unlink하려다 Windows `EPERM`으로 중단됐다. 출력에는 lock 파일/프로세스 점유 가능성이 표시됐지만 원인을 확정하지 않았다. 지시대로 재시도하지 않았다.
- 따라서 이번 실행에서 UI 검수, 저장, 새로고침, 백업/복원은 실행되지 않았다. 통과로 간주할 결과는 없다.

## 결과 및 미확인

- 실제 30문항·8그림 원본-only/CLI ZIP parity: **미확인**. 전용 공개 합성 30/8 fixture 및 해당 단일 통합 실행이 없다.
- Import 저장 후 재진입: **이번 실행 미확인**. 기존 테스트 코드에 3/3 합성 CLI ZIP의 바로 저장·새로고침 확인 절차가 있으나 본 실행은 서버 시작에서 막혔다.
- 백업 생성/복원 후 30/8 자료 보존: **미확인**. 현재 실행 시도에는 백업/복원 시나리오가 포함되지 않았다.
- GPT/실제 API, 사용자 비공개 자료: 사용하지 않았다.

## CI용 후속 구현 (로컬 미실행)

- `tools/diagram_pipeline/examples/create_vision_30x8_demo.py`가 공개 합성 원본 PNG, 30문항·8그림 관측, 30개 assessment(난이도 72·중요도 85, 원문 ①과 제안 ② 충돌, 학습 후보, source answer intent/notes/choice judgements 포함), 원본-only CLI job을 만든다. 평가 데이터는 fixture 전용이며 실제 GPT/API 실행이나 사용자 자료를 뜻하지 않는다.
- `tools/diagram_pipeline/tests/test_vision_30x8_roundtrip.py`가 CLI package 실행 후 문항·답안·평가·학습 후보 30개, 그림 8개, 원본 기본 선택, 정리본 부재, 충돌/provenance·source metadata 및 crop 디코딩을 확인한다.
- `e2e/vision-30x8-roundtrip.spec.ts`가 동일 원본·관측으로 브라우저 원본-only crop을 만들고 CLI ZIP crop 픽셀/문항 번호/텍스트/그림 참조 위치와 비교한 다음, CLI ZIP Import 저장→새로고침→브라우저 백업 생성→빈 격리 저장소→복원→재진입의 문항·그림·페이지 수를 확인하도록 추가됐다.
- `.github/workflows/ci.yml`의 diagrams job이 합성 job과 CLI ZIP을 생성해 artifact로 올리고, e2e job이 이를 받아 통합검사를 실행하도록 연결했다.
- **위 신규 생성·검사·CI 연결은 이 작업에서 실행하지 않았다.** 앞서 기록한 Playwright webServer `EPERM` 실패 이후 로컬 재시도/서버 실행을 하지 않았다. CI 성공 전까지 30/8 parity 및 저장·백업·복원은 미확인으로 남는다.

## CI에서 확인할 결과

- 로컬 환경 실패 이후 테스트나 서버를 재실행하지 않았다. 합성 fixture 생성기와 Python 검사, 브라우저 원본-only/CLI 픽셀 parity, Import 저장·재진입·브라우저 백업·복원 통합 흐름을 CI workflow에 연결했다.
- CI가 성공하기 전까지 위 신규 검증은 **미실행**이며 parity 및 왕복 결과는 판정하지 않는다.
