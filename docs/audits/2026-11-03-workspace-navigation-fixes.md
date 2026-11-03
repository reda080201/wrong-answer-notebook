# Workspace, search and desktop UI follow-up — 2026-11-03

Based on main fd403dbc plus unmerged Draft #183 bc92f70a. Submitted above #183 so only this follow-up appears in its diff. No user data or installation changes.

- AppModals now normalizes structured question presentation before creating workspace drafts. Existing questionText is retained when canonical segments are empty, and existing canonical order/legacy supplementation uses the existing normalizer.
- Search reset uses null, the existing all-subject contract, rather than the literal subject all.
- Workspace review counts/filter/list state include local validation issues; fatal issues disable initial save, while commit recovery/cleanup remains available. Save continues to revalidate.
- Dialog size selectors have sufficient specificity to beat the default modal-card width independently of load order. Internal layout and sizes remain unchanged.
- AI composition highlights request before a proposal and save after a proposal; disabled save-and-start no longer gets implicit last-child emphasis.
- Focus guidance now asks the user to confirm the answer and record a review result without suggesting that the problem was correct. Existing exact-copy test assertions updated; no tests removed or disabled.

Direct isolated-browser verification used the same synthetic Import-v2 JSON with 2 questions, nonempty questionText and empty contentSegments: import -> workspace both bodies present -> save -> reload -> entry bodies present. Missing search -> reset restored both list and selected body. AI composer measured 960px after previously 480px, with request as the primary action. Screenshot: C:/Users/reda0/.codex/visualizations/2026-11-03-general-audit/ai-composer-fixed.png.

Local validation: type check passed; lint 0 errors / 2 pre-existing warnings. Related AppModals/workspace/presentation tests 24 passed. Focused guidance tests and final Vite build/CSS contracts are being completed; final results recorded in PR. Full CI assigned to final head, not repeated locally.

Remaining acceptance: complete light/dark 1100x750 and 1536x970 matrix, invalid-body edit/resolution UI, final focus guidance screen, real API, real PDF/images, native app, A4/print and 200% zoom not verified in this pass. Merge readiness pending CI and acceptance. Draft, no merge.

## Review-message follow-up — 2026-11-04
Removed the unsupported claim that an unqualified needs_review state originated in an imported file. Unblocked questions without a specific warning now receive neutral compare-and-confirm guidance; blocking errors/answer/figure states keep their specific instructions instead. Explicit warning text remains visible. No data format or save policy change.

WorkspaceReviewNotice tests: 7 passed, including generic review, explicit reason, reference error, unconfirmed answers and maintenance/figure blocking. Direct isolated-browser verification: recover synthetic draft -> blank body (specific error, save disabled) -> restore body (neutral guidance) -> compare confirmation -> preserve/close/reopen (additional confirmation not needed). Screenshot: C:/Users/reda0/.codex/visualizations/2026-11-04-audit/review-origin-fixed.png. Changed-file lint/type/diff validation results are recorded in PR.
