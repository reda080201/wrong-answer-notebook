# Remaining lint warning cleanup

## Basis and submission

Independent worktree based on main e687391e, integrating the existing #180 and
#179 branch changes locally. No GitHub PR was merged, closed or marked ready.
#178 and #169 remain separate. #169 overlaps list code and will require careful
integration; this work does not claim to include its navigation/list changes.
No installer/user data/public storage format changes, dependency additions or
paid API calls. ESLint configuration and warning thresholds are unchanged.

## Structural changes

- Derive valid selections and explicitly guard owner-state adjustments by actual
  source/key changes. Preserve external navigation, pagination, dirty edits and
  incoming review-session behavior; do not set parent state during child render.
- Keep Blob URL allocation/revocation in a real external resource subscription.
  getSnapshot remains pure/stable; StrictMode and replacement dispose owned URLs.
- Separate async snapshot reads from state commits and manual reload feedback.
  Queue drain, request generation, readiness and mutation-revision guards remain.
  Revisions are captured BEFORE reads, never after the awaited load.
- Keep generation cleanup on stable ref objects and invalidate their latest value.
  Do not replace current-generation checks with initial-number snapshots.
- Keep imperative exam-answer protection when parent props update; add the
  complete session dependency while retaining the conditional ref replacement.
- Preserve TextReview dirty body/structure/ignored segments on same-ID refresh;
  pristine views update and explicit latest-data adoption resolves a conflict.
- Reset PNG comparison confirmations on entry, source crop/page assets and
  rendered asset identity, independent of text fingerprint. URL cleanup remains
  effect-owned; failed/stale decodes cannot approve a comparison.
- Add workspace-ID ownership and recovery generation checks after awaited reads,
  asset validation and cleanup. Already started durable writes still finish.
- AI status belongs to the requested provider settings. Previous-owner status
  is hidden during a new request; successful normalized responses do not leave
  the UI stuck in loading because of different runtime metadata.

No timer, resolved microtask, custom effect wrapper, rule suppression or dummy
dependency was introduced to disguise a warning.

## Verification approach and limits

Scoped agent lint runs preceded the final whole-source lint. The first diagnostic
run exposed 4 errors and 11 warnings; ref access/resource ownership/remaining
async boundaries were corrected instead of weakening rules.

Local regression runs were sequential, three files:
warningStateTransitions (3), staleLoads (4), useEntries (19): 26 unique cases.
The first new test selector omitted the existing accessible-name prefix;
correcting it to the full label preserved the assertion and the rerun passed.
No worker retries, skipped tests, timeout increases or full local suite.

These are React/jsdom/mock-backend checks, including real Blob URL subscription
lifecycle ownership under StrictMode. Manual Windows operation, real API calls,
live storage failure UI and the full visual/zoom/A4 matrix are not verified.
Full Frontend/Python/E2E/Rust/Tauri verification is assigned to final-head CI.
Lint success alone is not proof that all behavior or performance is correct.

## Final local result

- Whole-source ESLint: 0 errors, 0 warnings, unchanged configuration. The final
  question-bank selection variable typo was caught by TypeScript, corrected and
  scoped-linted before the successful TypeScript/Vite build.
- TypeScript/Vite build passed. Main chunk 1860.00kB / gzip 552.59kB; PDF chunk
  502.93kB. Vite's large-chunk warning remains, without raising its threshold.
- git diff --check passed. No Rust/dependency changes in this cleanup itself.
- Diagnostics are outside the repo:
  C:/Users/reda0/.codex/visualizations/warnings-20261101/final-cleanup/
- Existing lint debt is removed from this integrated source, not marked harmless.
  Functional readiness still depends on final-head CI and missing manual coverage.
