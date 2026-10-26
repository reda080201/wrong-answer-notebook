# Vision import v8 — implementation and verification

## Baseline and isolation

- main `3c5e9b9aeccc3ee77ac755e0ab19ed84cca09416`; Draft #162 base/head `ada0f5299d444d435fa1e06db52914fbe997028f` was open when work started.
- Independent managed worktree/branch `codex/vision-import-v8`, based on #162. Primary checkout and its six untracked reports preserved. Independent npm ci and hash-locked CPython 3.12.14 environment installed.
- No merge, installed-app replacement, runtime distribution approval, or private exam fixture committed.

## Cause and implementation

The existing CLI required manually populated reviewed.json. Its manifest rejected
zero-figure documents and represented question sources as a single page. The app
staged page images but passed their names to the saved-image reader; frontend
AbortSignal also did not cancel this legacy provider HTTP request.

- Shared vision-v1 schema plus bounded TS/Python validators: duplicate keys, strict
  field/type/reference checks, physical page identity, scoped IDs and explicit anchors.
- import-vision adapter and run-vision job bridge bind actual inspected original
  bytes/hashes; question sourceRefs preserve multiple physical pages and export-local
  page indexes. Unknown/duplicate numbers require review or explicit exclusion.
- Unconfirmed computational previews are separate from human-reviewed redraw. Unknown
  mark/endpoint conventions are rejected instead of silently ignored. Candidate failure
  retains original evidence and a failure caption; integrity errors still block packaging.
- Native analysis uses a session-scoped image reader through the existing cancellable
  study AI provider request. Multiple uploaded sources keep their own identity and
  multi-entry results open one review workspace without saving automatically.
- Original PDF bytes stay in the explicitly exported job, separate from raster pages.
  Drafts retain observation/hash metadata; the same source files must be reselected
  after restart. Temporary originals remain available during the current workspace.
- Existing comparison/save/backup paths preserve original default and explicit user
  choice. Edited observation drafts do not overwrite canonical workspace question edits.
- Prompt and adapter UI modules load on demand. Existing renderer, ZIP trust stripping,
  staged fixed-ID commits, and public entry/Import-v2 formats retained.

## Actual artifacts

Synthetic job: `build/diagram-pipeline/v8-final/input/vision-job.zip`.
Actual generated ZIP: `build/diagram-pipeline/v8-final/output/output-import-v2.zip`.
SHA-256: `b6f0a9345ae3cdbdd21d35cac426af424d47de59ef58359f2dd29bc18ff62799`.
Four packaged image assets, seven checked artifact references, source ROI checks pass.
The final synthetic source includes the observed numeric endpoint labels. This is a
synthetic observation attached to actual synthetic original bytes;
it is not OCR validation of a private exam. Public fixture: `e2e/fixtures/vision-pipeline-v8.zip`.

## Local verification (updated as work completes)

- Locked Python install and Ruff: pass. Full Python: **87 passed**.
- Related TS/import/draft unit tests: **64 passed** at the recorded checkpoint.
- Existing v7 PNG/selection/reload E2E: three passed before a new selector mistake.
- New v8 E2E: **4 passed**, 1100px and 680px, actual job download bytes,
  original/candidate decode, explicit selection and persistence after refresh.
- The first new bridge test incorrectly selected an HTML tab while the existing control
  is a pressed button. Corrected the new selector and asserted aria-pressed=true;
  no existing assertions, skip policy, or time limits were weakened.
- Initial build and subsequent split-module build pass. Known large bundle warnings
  remain; no general app speed improvement is claimed.
- npm run check: version, lint (0 errors/53 existing warnings), debug, MCP/Tauri,
  startup, release and CSS contracts passed; default fork unit stage stalled while
  workers repeatedly exited/restarted. Interrupted and recorded, not counted as pass.
  A full threads run passed 214 files / 1346 tests but reported one worker-start timeout;
  the missing generatedExamSourcePageRegression file passed separately (2 tests).
  This is not a full local unit pass. Bundled Node 24.19 also reproduced the default
  fork startup stall; system Node was 24.17. Cause remains unconfirmed. No timeouts
  were increased and no tests were skipped.
- Local Windows cargo check: pass (single build job). Rust clippy/test and Windows Tauri compilation are executed by the same-head Windows CI;
  local check/fmt are separate evidence. No installed executable was replaced.
- First published head 5ada831f: GitHub Frontend (215 files / 1348 tests), E2E
  (59 tests), Python (87 tests plus actual PNG/ZIP/runtime probe), Rust (92 tests),
  and Tauri compile all passed in run 39916802053. Final-head results are tracked
  separately and must not be inferred from this earlier head.

- Full local E2E: **57 passed / 2 failed**. A4 vertical 1100x750 lost the
  practice reader during navigation; A4 vertical 1536x970 measured a non-oversized
  page at ratio 0.62025 instead of 0.70707. Existing expectations/timeouts unchanged.
  These are unresolved local failures, not a complete pass or a proven v8 regression.
- First local final focused reruns also stalled at worker startup and were stopped.
  Earlier related 64-test pass remains checkpoint evidence, not final full validation.
- 5f0bd9aa same-head CI Frontend/E2E/Python/Rust passed; Tauri was still running at
  this recording. The final PR report records the later head including UI error-summary
  improvements and must supply that head's five conclusions.

## UI evidence

Direct browser use on a fresh isolated origin (1501) confirmed actual generated ZIP
import, original/candidate loading, explicit compare confirmation/selection, save once,
refresh and reopening with the selected candidate retained. Light theme and 1100/680px
were inspected. Invalid observation JSON was also checked; its raw one-line error led
to the Korean summary + expandable error detail improvement, covered by the new E2E.
No real AI provider request was made. Test tab/server were closed after inspection.

The saved captures below are browser E2E evidence, not installed Windows-app captures.

Screenshots: `build/diagram-pipeline/v8/bridge-680.png` and `comparison-1100.png` locally;
new E2E also writes `vision-bridge-{width}.png` and `vision-comparison-{width}.png`
to test-results, uploaded by the existing E2E CI artifact step.

## Limits and readiness

- Real provider calls, private PDF OCR accuracy, installed Windows UI and real touch
  remain unverified. The supplied Import-v2/private ZIP is not a substitute for original
  PDF/AI extraction accuracy measurements; no 3–5 exam accuracy claim is made.
- Browser cannot execute Python. Native subprocess/sidecar integration and runtime
  deployment remain separate. Python3.15 full pipeline support is not claimed.
- No CairoSVG/scikit-image/GTK added. Existing PyMuPDF AGPL/commercial and complete
  redistribution/license gate remains closed (`releaseApproved:false`).
- P0/P1: no new reproduced data-loss or approval bypass in completed checks; unverified
  routes are not certified safe. P2: default local fork/full validation investigation.
  P3: existing bundle warnings and entryPaneOverrides cleanup remain separate.
- MVP-ready: **YES for the synthetic local CLI/import bridge**; real OCR/provider accuracy remains unverified.
  Merge-ready: **NO** while local full-unit startup and two A4 E2E failures remain unresolved.
  Release-ready: **NO** (deployment/license gate outside this change).
