# Desktop analysis import UX — 2026-11-03

Baseline: origin/main fd403dbc. Independent worktree and isolated browser on port 1511; synthetic 400×300 blank PNG only. No paid API request was made.

## Corrected findings
The earlier report inspected an older working tree: current main already uses .8125rem for exam-result status and Lucide X in the AI composer. No change was necessary for those findings. The AI composer layout and full exam-result interactions have not been verified in this pass.

## Reproduced and changed
- Assessment checkbox was inside collapsed analysis options. It is now visible, with mode-specific explanation.
- The pre-analysis screen devoted half its width to an empty preview; the settings column became narrow. Visual mode now uses one column until a draft exists. Existing preview remains available when there is content to review; other import modes retain their preview.
- At 1100×750 the inline analysis action fell below the scrolling area while the fixed footer displayed disabled save actions. Before a visual draft exists, the footer now presents the analysis action and its current blocking reason. It calls the existing analysis procedure with the same locks and cancellation handling.
- Long mixed-source/restart/evidence text is in a disclosure. Selected file count, analysis mode and API-cost warning remain visible in the form.

## Direct use
Actual application in IAB: selected the synthetic PNG, toggled assessment, changed the file role to answer-only, observed disabled analysis, opened nested settings, changed isolated theme to light, closed settings, and verified the fixed action. Dark and light 1100×750 screenshots captured. 1536×970 was observed during the intermediate layout; the final full matrix and 200% zoom are not complete.

Local screenshots (not user source material):
- C:/Users/reda0/.codex/visualizations/desktop-analysis-ux/import-after-dark.png (intermediate two-column evidence)
- C:/Users/reda0/.codex/visualizations/desktop-analysis-ux/import-final-1100-dark.png
- C:/Users/reda0/.codex/visualizations/desktop-analysis-ux/import-final-1100-light.png

## Validation
Independent npm ci completed. Full lint: 0 errors, 2 pre-existing set-state-in-effect warnings (EntryListPane and ImageField). Final TypeScript/Vite build succeeded; existing large-chunk warning remains. CSS ownership: 3 passed. git diff --check clean. Related ImportFromGptModal test file: initial 43 passed / 2 failed, exposing that the new footer removed the reanalysis action once a draft existed. Fixed by retaining the inline action for existing drafts. The two failed scenarios were selected for rerun and both passed (the other 43 were not rerun; no tests were edited or disabled). Final TypeScript check passed.

No broad UI/UX completion or merge readiness is claimed from this narrow pass. Real AI, real PDF/ZIP, successful analysis-to-preview, native app, A4/output, long-title/formula matrix and 200% zoom remain unverified. Public data format unchanged. Draft PR; no merge or installation replacement.
