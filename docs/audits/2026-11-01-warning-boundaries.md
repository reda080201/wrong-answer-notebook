# Warning boundaries follow-up

Base main e687391e; independent worktree, no user-data or installer changes.

## Implementation
- Skip list state replacement when expanded IDs are unchanged. Persistence occurs
  outside React state updaters, only when serialized IDs change.
- Keep AI maintenance subscription stable, invoke latest reload callback, and
  synchronously reflect maintenance events in its guard. Generation invalidation,
  cancellation, pending-write checks and protected-source policy remain intact.
- Stabilize absent source-page arrays; capture figure image filenames for effects.
- Separate PNG model/fingerprints from rendering, retain old exports for callers.
  Rendering stays dynamic. Remove redundant dynamic imports from modules already
  loaded statically; no chunk-limit increase, disabled rules, or forced chunks.

## Baseline warning disposition
Baseline log: a3206bd0, 52 set-state-in-effect + 10 exhaustive-deps.
These are triage dispositions, not claims that every retained warning is harmless.
Mount-time storage loads and review/form resets need separate behavior checks;
they are not mechanically deferred, remounted, or removed to silence the rule.

| Location | Disposition |
|---|---|
| components/EntryListPane.tsx:111 | 동일 상태 갱신 방지 및 저장 부작용 분리 |
| components/LectureReaderView.tsx:73 | 후속 확인 필요; 이번 변경에서 유지 |
| components/ReviewPanel.tsx:110 | 후속 확인 필요; 이번 변경에서 유지 |
| components/SettingsModal.tsx:158 | 후속 확인 필요; 이번 변경에서 유지 |
| components/StudyZoomViewport.tsx:39 | 후속 확인 필요; 이번 변경에서 유지 |
| components/TextReviewPanel.tsx:73 | 후속 확인 필요; 이번 변경에서 유지 |
| components/TextReviewPanel.tsx:82 | 후속 확인 필요; 이번 변경에서 유지 |
| components/TextReviewPanel.tsx:87 | 후속 확인 필요; 이번 변경에서 유지 |
| features/entries/components/EntryDetail.tsx:338 | 요청 세대 무효화 ref; 초기값 복사로 대체하지 않음 |
| features/entries/components/EntryDetail.tsx:379 | 후속 확인 필요; 이번 변경에서 유지 |
| features/entries/components/EntryDetail.tsx:539 | 후속 확인 필요; 이번 변경에서 유지 |
| features/entries/components/EntryDetail.tsx:582 | 후속 확인 필요; 이번 변경에서 유지 |
| features/entries/components/EntryDetail.tsx:585 | 후속 확인 필요; 이번 변경에서 유지 |
| features/entries/components/EntryDetail.tsx:590 | 후속 확인 필요; 이번 변경에서 유지 |
| features/entries/components/EntryDetail.tsx:985 | 후속 확인 필요; 이번 변경에서 유지 |
| features/entries/components/EntryDetail.tsx:1162 | 후속 확인 필요; 이번 변경에서 유지 |
| features/entries/components/EntryForm.tsx:115 | 후속 확인 필요; 이번 변경에서 유지 |
| features/entries/components/EntryForm.tsx:124 | 후속 확인 필요; 이번 변경에서 유지 |
| features/exam-builder/components/GeneratedExamsDialog.tsx:39 | 후속 확인 필요; 이번 변경에서 유지 |
| features/exam-builder/components/GeneratedExamsDialog.tsx:45 | 후속 확인 필요; 이번 변경에서 유지 |
| features/exam/components/RealExamSessionView.tsx:54 | 빠른 답안 입력 보호; session 전체 의존성 추가 보류 |
| features/export/components/ExportHubModal.tsx:104 | 후속 확인 필요; 이번 변경에서 유지 |
| features/export/components/QuestionRenderComparisonPanel.tsx:56 | 후속 확인 필요; 이번 변경에서 유지 |
| features/figures/components/FigureComparisonPanel.tsx:44 | 이미지 파일명 캡처로 의존성 수정 |
| features/import-workspace/components/ImportDraftRecovery.tsx:16 | 요청 세대 무효화 ref; 초기값 복사로 대체하지 않음 |
| features/import-workspace/components/ImportWorkspaceView.tsx:324 | 후속 확인 필요; 이번 변경에서 유지 |
| features/import-workspace/hooks/useImportWorkspaceAutosave.ts:95 | 요청 세대 무효화 ref; 초기값 복사로 대체하지 않음 |
| features/import/components/ImportFromGptModal.tsx:200 | 후속 확인 필요; 이번 변경에서 유지 |
| features/import/components/ImportFromGptModal.tsx:441 | 후속 확인 필요; 이번 변경에서 유지 |
| features/import/components/ImportFromGptModal.tsx:458 | 후속 확인 필요; 이번 변경에서 유지 |
| features/import/components/ImportFromGptModal.tsx:479 | 후속 확인 필요; 이번 변경에서 유지 |
| features/import/components/ImportFromGptModal.tsx:489 | 후속 확인 필요; 이번 변경에서 유지 |
| features/import/components/ImportReviewWorkspace.tsx:86 | 후속 확인 필요; 이번 변경에서 유지 |
| features/import/vision/AssessmentCard.tsx:29 | 후속 확인 필요; 이번 변경에서 유지 |
| features/import/vision/MixedPageRoleDialog.tsx:64 | 후속 확인 필요; 이번 변경에서 유지 |
| features/import/vision/MixedPageRoleDialog.tsx:74 | 후속 확인 필요; 이번 변경에서 유지 |
| features/learning/components/KnowledgeGraphView.tsx:102 | 후속 확인 필요; 이번 변경에서 유지 |
| features/learning/components/LearningHubView.tsx:162 | 후속 확인 필요; 이번 변경에서 유지 |
| features/library/components/LibraryExplorer.tsx:98 | 후속 확인 필요; 이번 변경에서 유지 |
| features/library/components/LibraryExplorer.tsx:102 | 후속 확인 필요; 이번 변경에서 유지 |
| features/library/hooks/useLibraryFolders.ts:53 | 후속 확인 필요; 이번 변경에서 유지 |
| features/question-bank/components/QuestionBankDetail.tsx:51 | 후속 확인 필요; 이번 변경에서 유지 |
| features/question-bank/components/QuestionBankView.tsx:68 | 후속 확인 필요; 이번 변경에서 유지 |
| features/question-bank/components/QuestionBankView.tsx:75 | 후속 확인 필요; 이번 변경에서 유지 |
| features/question-bank/components/QuestionBankView.tsx:83 | 후속 확인 필요; 이번 변경에서 유지 |
| features/question-bank/components/SimilarQuestionLinksPanel.tsx:86 | 후속 확인 필요; 이번 변경에서 유지 |
| features/solutions/OriginalPageStudyView.tsx:22 | 빈 배열 안정화; 문항 이동 Effect 정책 유지 |
| features/solutions/OriginalPageStudyView.tsx:49 | 빈 배열 안정화; 문항 이동 Effect 정책 유지 |
| features/study-ai/StudyAiChat.tsx:135 | 후속 확인 필요; 이번 변경에서 유지 |
| features/study-ai/StudyAiChat.tsx:151 | 요청 세대 무효화 ref; 초기값 복사로 대체하지 않음 |
| features/study-ai/StudyAiChat.tsx:152 | 최신 reload ref와 유지보수 상태 ref로 구독 경계 수정 |
| hooks/useAiProviderSettings.ts:91 | 후속 확인 필요; 이번 변경에서 유지 |
| hooks/useAppNavigationState.ts:45 | 후속 확인 필요; 이번 변경에서 유지 |
| hooks/useEntries.ts:104 | 후속 확인 필요; 이번 변경에서 유지 |
| hooks/useExamSessionController.ts:156 | 후속 확인 필요; 이번 변경에서 유지 |
| hooks/useGeneratedExams.ts:73 | 후속 확인 필요; 이번 변경에서 유지 |
| hooks/useGptSolutionRoundtripDrafts.ts:64 | 후속 확인 필요; 이번 변경에서 유지 |
| hooks/useMcpBridgeSettings.ts:66 | 후속 확인 필요; 이번 변경에서 유지 |
| hooks/useMcpBridgeSettings.ts:87 | 후속 확인 필요; 이번 변경에서 유지 |
| hooks/useMcpBridgeSettings.ts:88 | 후속 확인 필요; 이번 변경에서 유지 |
| hooks/useReviewSessions.ts:52 | 후속 확인 필요; 이번 변경에서 유지 |
| hooks/useSettings.ts:73 | 후속 확인 필요; 이번 변경에서 유지 |


## Verification and limits
- Independent npm ci completed.
- Luna, three files sequentially, no worker errors: EntryListPane 10 passed,
  StudyAiChat 19 passed (existing maintenance reload/pending-data protection case),
  questionPng 4 passed through the retained compatibility import. Total 33.
  Added list regression covers title/memo rerender without a duplicate persistence.
- Final lint: 0 errors, 58 warnings (51 set-state-in-effect, 7 exhaustive-deps).
  Initial useRef import omission was corrected before the final lint/build.
- TypeScript/Vite build and git diff --check passed. No rule suppression or
  warning-limit increase. Four mixed static/dynamic-import warnings are gone.
- PNG renderer has a separate chunk: 36.52kB / gzip 10.96kB.
  Main chunk: 1849.31kB / gzip 549.30kB; large-chunk warning remains.
  Previous a3206bd0 reference build: 1885.99kB / gzip 562.10kB.
  This is not a controlled runtime latency comparison (base also includes #176).
- Actual rasterized PNG re-open and full existing E2E are assigned to final-head CI,
  not claimed from the four model/fingerprint unit tests. No live API call.
- Retained warnings remain technical debt, not verified harmless. Additional
  effects, reference cleanup and state-reset behavior need bounded follow-up.
- No actual native UI, assistive-technology, dark-mode matrix or user-data
  backup/restore run was performed. Existing open PRs remain untouched.
