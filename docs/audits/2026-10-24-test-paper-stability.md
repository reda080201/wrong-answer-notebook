# Test worker and A4 follow-up — 2026-10-24

## Scope and baseline

- Independent checkout: `codex/test-paper-stability`, based on Draft #163 head `9cf3ef50e8e0cf82ca541bd3f771cc06d040eac3`.
- Main was `3c5e9b9aeccc3ee77ac755e0ab19ed84cca09416`. #163 remains unmerged; this follow-up targets its branch.
- No user data, primary-checkout changes, dependency versions, public storage formats, or Rust sources are changed.
- Temporary logs, synthetic import data, process traces and screenshots remain in ignored build directories. Final whole-suite and same-head CI results are recorded in the PR, rather than treating this interim evidence as a whole-suite pass.

## Confirmed defects and repairs

### Late exam close completion

Reproduction: defer the save used by closing session A, then open session B or update A's answer before the save completes. Previously close returned success and cleared the newer session/revision. Both regression cases failed before the repair.

`useExamSessionController.ts` now closes only the exact revision it flushed. Its externally exposed setter also updates the imperative session ref synchronously; previously a same-turn history/resume action left that ref pointing at the old session until an effect ran. The setter signature and storage representation are unchanged.

Three hook regressions cover newer-session preservation, newer-answer preservation and immediate external replacement. These are deterministic deferred-operation checks, not claims that a storage failure was manually injected in the installed app.

### A4 observer and measurement lifecycle

Reproduction: pagination moves a React item under a different page/column and replaces its DOM node. The original ResizeObserver continued watching the detached node, so later size growth was missed. A regression proved that the current node was not observed before the repair.

`ExamPaperCompositor.tsx` synchronizes observer targets after every commit and disconnects removed targets. Font loading and image success/failure schedule measurement; cleanup removes observers, listeners and scheduled frames. A DOM layout-readiness signal is published after the corresponding pagination commit.

A second regression proved that an offscreen lazy measurement clone had neither width nor height even when the visible source image was decoded. Clones now reserve the loaded source's intrinsic dimensions, preserving explicit attributes and the original image's lazy loading. No extra eager decode or CSS ratio workaround was added. Pending lazy images remain progressive and remeasure on load/error.

The exact sequence behind every historical intermittent A4 failure is not proven. One failure still occurred after the observer-only repair; a subsequent single-case diagnostic passed. This is why clone sizing is tested separately and bounds are captured on every surface, including failures.

### Vitest configuration accuracy

Installed Vitest 4.1.11 does not implement `singleFork`; the unsupported option was removed. Explicit `isolate: true` preserves the installed default, and misleading setup comments were corrected. Pool=forks, min/max workers=1, fileParallelism=false and existing 30-second test/hook timeouts are retained.

This cleanup is **not a proven fix for the previous worker-start stall**. Resolved public configuration records Node 24.17.0, Vitest 4.1.11 and one isolated fork worker. A temporary preload records worker spawn/error/exit and memory samples without changing runner deadlines. No Windows resource-exhaustion event was found in the queried interval, which does not establish or exclude a memory cause. A long cold start alone is not classified as a crash.

## Evidence already obtained

- Independent `npm ci` completed. Existing audit output reported two moderate and one high finding; dependency remediation is outside this follow-up.
- Final related units: **23/23** across controller and compositor files, including five added regressions. Before-fix logs show the intended failures.
- Final focused A4 browser suite: **10/10**. Existing eight width/orientation cases retain their assertions and fixtures; two cases add delayed content growth and mixed normal/oversized page ratios at multiple scales.
- A4 surfaces include study, practice and real exam at 1100, 1280, 1536 and 1920 widths. Bounds/image metadata are saved alongside screenshots. Whole E2E remains a separate required result.
- Direct IAB use at isolated port 1504: import synthetic 30-question JSON, review, persist, view A4, resize to 680 and return to 1100. All 30 items remained with layout ready; document width/scrollWidth were both 680 in the narrow view.
- Direct light-mode practice: select option 2 for question 1, enter `42` for question 2, close, refresh, select the saved sheet and resume. The option remained pressed and answer `42` was restored. Fractions were stacked in the visible paper. Temporary tab, viewport override and server were closed/reset afterward.
- A dark-theme study screenshot showed low-contrast question text over white paper. This is a separate observed UI concern; the light-mode screenshot and checks must not be presented as validating dark-theme readability.

## Limitations and completion rules

- Synthetic material verifies layout and lifecycle, not OCR or mathematical equivalence of the user's PDF. No private source is committed.
- Actual touch, installed native-window interaction and live AI-provider calls were not performed. No installed build was replaced.
- No existing test was deleted/skipped, assertion relaxed, or timeout increased. A diagnostic run stopped after its first failure is not a full-suite pass.
- Final PR must distinguish local whole-suite outcomes, unresolved worker-start causality, and the five checks on its final head. No automatic merge.

## Whole-run follow-up

At head `e7710711359a64466580a102294c5e18d9be5da8`, local `npm run check` completed, including **215 files / 1,354 unit tests**, lint, contracts and production build. Worker traces recorded 215 forks, 215 spawns, 215 exits and zero child errors. The installed reporter's lack of intermediate per-file output was not a stall in this run. Installed Vitest stops isolated runners after tasks; SIGTERM cleanup alone is not evidence of a worker crash. The historical startup error remains causally unconfirmed.

The whole local E2E run then completed **59 passed / 2 failed**: vertical A4 at 1280×720 and 1920×1080. Both failed geometry snapshots explicitly recorded `pending`, despite a preceding readiness assertion. For example, question 5 at 1280 had actual height 742 and an old model height 573 after image load; the later measurement clone height was 741. This establishes an observation race during remeasurement, rather than a reason to relax the aspect-ratio threshold. All five GitHub jobs passed on that same head, which does not erase these local failures.

The follow-up E2E change reads readiness, image decode state and geometry atomically in one DOM snapshot, polling only readiness/decode state under the existing expectation timeout. Original one-shot ratio, containment and overflow assertions remain unchanged. No geometry result is polled until it happens to pass. Final focused/whole E2E and new-head CI results are recorded separately in the PR.

## Pending-media lifecycle repair

Atomic observation exposed another product boundary: head `62536c7a93807b32ab556fc288157608f1a223c8` still failed remote horizontal A4 readiness (1920×1080, including retry; 1280×720 was flaky). Four other CI jobs passed. The local focused run was 9/10; its first failure returned to the initial list, with navigation/reloading causality unconfirmed. A subsequent local whole diagnostic passed that first case but reproduced pending layout at vertical 1536×970. It was explicitly interrupted after 28/61 cases to repair the known failure; it is not a whole-suite pass.

ImageGallery resolves image URLs asynchronously after mounting. Moving the item between pages remounts it, temporarily replacing the loaded image with a shorter URL-loading placeholder. Previously this smaller measurement could move the item again, repeatedly losing the loaded state. Captured runs alternated question 5's approximately 573px placeholder and 741px decoded measurements. The new deterministic regression first failed on a 600→400 height regression while pending, and also requires a resolved 500px image to be allowed to shrink normally.

ImageGallery now marks its existing URL-loading placeholder. The compositor retains each prior narrow/wide height only while a marker or incomplete image is present. Resolved content, including load-error content, can shrink again. A visible URL placeholder keeps the layout pending; hidden-page loading remains progressive. A filtered MutationObserver notices loading-marker replacement even when box height is unchanged, excluding the compositor's own temporary measurement hosts. This also avoids declaring readiness before asynchronous URL resolution completes. No eager image loading, storage migration or timeout increase was introduced.

The atomic observation change alone was insufficient; the failed logs and head above are retained and must be reported alongside final results. Final verification is on the subsequent head, with the actual no-image URL-placeholder transition covered by the regression.

## Canonical height and observer delivery boundary

Head `5302d085562b5f0ad55032c20c1da0e8cf9b1104` passed local full E2E **61/61** and related units **29/29**, lint and build. Its remote E2E nevertheless completed **60 passed / 1 failed**, vertical 1280×720 (including retry failure); the four other jobs succeeded. The downloaded bound snapshot establishes the remaining race precisely: reader state `ready`, decoded image 240×140, canonical item height **742**, committed measurement **573**, page ratio **0.6196448** instead of approximately **0.70707**.

An image's intrinsic size can change before its queued load/ResizeObserver callback updates the readiness flag. The compositor now includes the actual visible unscaled `offsetHeight` when its unscaled width matches the clone measurement width, and checks the committed DOM measurement before publishing ready. Hidden pages' zero dimensions are excluded. A new regression demonstrates canonical 700px content versus a 600px offscreen clone, rather than trusting the clone alone.

The E2E readiness snapshot additionally requires the committed measurement to cover the actual box, allowing the existing 1px rounding difference. This waits for the model to reflect decoded content within the existing timeout. Aspect ratio, containment and overflow remain separate unchanged one-shot assertions; they are not polled into passing. Final head outcomes are recorded in the PR, including the above failed intermediate runs.

## Actual renderer producer coverage

Head `9ce7a5bcd2cd311d941de5012ecbb1bd8e0fabf9` passed local A4 **10/10**, related units **30/30**, lint and build. Remote E2E still completed **60/61**, with vertical 1536×970 failing the freshness precondition. Its artifact showed pending layout and question 5 back at the 573px placeholder. The local pass is not substituted for the failed remote result.

Tracing the actual canonical call chain exposed the remaining integration omission: `QuestionContentView.FigureContent` uses **ZoomableImageViewer**, not ImageGallery. Its asynchronous URL-loading paragraph had no loading marker. InlineQuestionText's figure slot and the annotated-image renderer also had independent unmarked URL-loading states. Thus the pending-height policy added earlier could not recognize these real placeholders.

The same internal loading marker is now produced by all four renderers. Separate deferred-URL regressions first failed on ZoomableImageViewer and InlineQuestionText's missing markers, then require the marker to disappear when the image resolves. An unknown inline figure without a filename remains a review warning, not a pending file request. A resolved empty inline URL is also no longer marked pending. Annotated images treat an empty resolved URL as a load failure, retaining the saved image reference rather than waiting forever; its deferred-to-empty boundary is covered separately.

The compositor's preservation, canonical-height check, original assertions and existing timeouts are retained. Final checks cover these actual producer interfaces as well as the consumer's synthetic loading transition. No success claim is made for an intermediate head with failed E2E.
