# Dialog focus follow-up

Base: main 0e10acbe (includes #177). Existing worktrees and user data preserved.

## Change and evidence

Initial focus previously called focus() on an explicitly supplied target without
checking eligibility or actual success. Hidden, disabled, detached, external or
non-focusable targets could leave focus outside the dialog.

The dialog now checks connected/contained/enabled/visible/non-inert candidates,
including disabled-fieldset descendants. Explicit tabindex=-1 headings remain valid.
If focus does not move, it tries the marked target, eligible controls, then dialog.
A pending parent RAF does not move focus when a later dialog is above it.
The same eligibility checks exclude invalid controls from Tab-cycle candidates.
No public props, data formats, timers or storage queues were changed.

## Checks

Luna: one sequential command, Dialog.test.tsx, 13 passed. No skipped tests or
worker retries. npm ci completed independently. Lint: 0 errors, 62 warnings.
TypeScript/Vite build passed with the existing large-chunk warning.
git diff --check passed. No CSS selectors were changed.

CUA direct browser use of an isolated synthetic screen using the real Dialog:
disabled initial target falls back; nested confirmation takes focus; Tab remains
inside; Escape returns to parent opener, then original opener. 1100x750 and
1536x970 were exercised. A synthetic error and retry control were displayed.
This is NOT an end-to-end verification of actual settings, AI, solutions, storage
failures, image errors, or screen-reader announcements.
The first harness page was blank because its react-dom module URL was invalid;
using Vite bare imports fixed the harness. This was not a product regression.
Native app inventory timed out; Windows-native operation is not verified.

Screenshot (outside repository):
C:/Users/reda0/.codex/visualizations/dialog-focus-20261101/nested-1100.png

## Limited performance observation

Browser performance.now, five samples, development build. Synthetic entries each
referenced a missing session; equally sized session arrays had unrelated IDs.
Each sample applied presentWrongAnswerSharedPassage to all entries then filtered.

30: 13.1, 10.1, 5.5, 6.7, 6.0 ms (median 6.7).
300: 46.6, 25.7, 29.2, 31.4, 29.2 ms (median 29.2).

This covers missing-session lookup only, not successful canonical recovery, React
commit/input latency, memo/title updates, or native performance. No performance
improvement is claimed and no cache/virtualization was added.
Five passes mean 150/1500 presentation calls respectively, not measured App
re-render counts.

## Remaining acceptance

Actual AI/solution/confirmation stacking, real storage/image-failure recovery,
dark-mode visual matrix and assistive-technology announcements remain unverified.
No extra live region, guessed mathematical alt text, layer rewrite, or CSS change
was made without a reproduced defect. Full suites are assigned to final-head CI.
No merge/installer changes. Merge readiness requires CI and remaining acceptance.
