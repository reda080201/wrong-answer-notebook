# Clock, backup filenames, and external links

Base: origin/main 7f0dd3102880c7e8cb5392b9f0bd816455af9cf1.
Independent branch; existing PRs #169/#176 and user worktrees are unchanged.

## Findings and changes

- generateExam accepted an injected now but candidate filtering used Date.now().
  Pass the same instant to collection; preserve the strictly-newer-than cutoff policy.
- ZIP/JSON filenames used UTC calendar dates, which can show yesterday in Korea.
  Use local year/month/day for filenames only. Persisted metadata remains UTC ISO.
- External links used window.open without an explicit native OS opener.
  Add the official Tauri opener (JS 2.5.3, Rust locked 2.5.5) and scope permission
  to exactly ChatGPT and this repository's releases page. Preserve the browser
  popup-handle/opener-detachment behavior. A shared action handles errors, manual
  address copying, and repeated clicks. Copy does not reopen or send content.
  No live native failure was reproduced; this closes a platform-routing gap.

## Verification

- Independent npm ci completed; opener dependencies added afterward.
  Existing @tauri-apps/api remains locked at 2.11.0.
- Luna: generateExam.test.ts 9 passed; backupFilename.test.ts 2 passed;
  chatGptConnection.open.test.ts 6 passed, sequential file commands, no worker errors.
  Seoul/UTC dates, recent cutoff -1ms/0/+1ms, native/browser routing, rejection,
  allowlist, and failure-to-copy independence are covered with synthetic/mock input.
- Initial TypeScript build found an incomplete new ReviewState test fixture.
  Required fields were added without changing assertions. Final TypeScript/Vite build passed.
- npm run lint: 0 errors, 62 warnings. Existing effect warnings remain.
- Tauri command contract, cargo fmt --check, cargo metadata --locked --no-deps,
  and git diff --check passed. Full local suites were not repeated.
- Build still reports large chunks (main 1885.69kB, gzip 562.02kB);
  this change does not claim to resolve bundle size or rendering performance.

## Limits and release gate

Native OS browser launch and live popup/clipboard UI are not manually verified.
No actual API call, user-data write, backup restore, installer replacement, or merge.
Full Frontend/Python/E2E/Rust/Tauri checks are assigned to final-head GitHub CI.
CI and native manual acceptance must be assessed separately; merge readiness is
not asserted by mock tests. CSP/KaTeX changes, generic JSON fallbacks, global time
services, random-ID replacement and bulk array changes are deliberately excluded.
