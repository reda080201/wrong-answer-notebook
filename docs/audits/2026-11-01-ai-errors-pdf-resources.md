# AI error guidance and PDF resource protection

Based on #173 branch 3119ecca (including its latest main merge). Existing PRs, user files and installed application remain untouched.

## Changes

- Shared OperationError recognizes explicitly labelled HTTP/AI-provider status 401, 403, 429 and 5xx. It preserves the original technical text and existing validation/partial-save messages. It makes no ETA, retry-after or quota-reset claim. AI chat uses this same renderer for request failures; record, save and protection errors keep their paths.
- The chat explains maintenance, record loading/reload failure and material-scope changes that disable sending. Busy request feedback from #171 is not duplicated. No new state-management dependency or paid API calls.
- PDF viewport dimensions are validated before canvas allocation against the existing 16,384px/64M pixels/256MiB RGBA policy. Existing 12-page limit, scale 1.5 and sequential processing remain. A page finally block clears the canvas backing store and page resources. The document finally now also covers cancellation immediately after load and the page-count rejection.

## Validation limits

New PDF tests use mocked PDF.js page/render objects and a stub blob. They verify allocation boundaries and cleanup; they are not actual synthetic PDF decoding or PNG mathematical accuracy evidence. HTTP tests and chat tests use mock responses. No actual provider invocation.

Existing theater and knowledge-graph regressions are reused for conditional investigation. Direct desktop light/dark keyboard/overlay interaction and injected graph/restore races remain unverified in this pass; those conditional refactors are intentionally not made without a reproduced failure. The pre-existing 1100/1200px policies, automatic Dialog notification host and font-display swap are retained. Desktop zoom/default-font/A4 acceptance remains open.
