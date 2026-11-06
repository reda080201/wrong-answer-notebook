# Structural boundary fixes — 2026-11-04

Base: PR #184, f0e045da. This follow-up preserves #184 and its Draft state.

- Maintenance now awaits every started flush, including synchronous failures, before releasing write/operation locks. Multiple failures are collected; the maintenance task is not run after failed flushes.
- Browser v2 restore retains images referenced by surviving pending Undo records. Existing collision and missing-image checks apply before writes. No backup schema change.
- Native close subscription cleanup handles registration completing after disposal; registration failures are handled in the existing close-error state.
- The library storage key now lives in a dependency-free module. Existing API re-export remains compatible, removing the backend/library-service cycle.
- No broad component extraction, native installer change, user-data manipulation, paid API call, or merge.

Validation: 4 related test files / 29 tests passed, including delayed flush failure/overlap, late close subscription disposal, registration failure, and v2 Undo-image retention/collision. Changed-file lint and TypeScript/Vite build results are recorded in the PR. Full tests remain assigned to CI. Native window interaction and full backup/Undo UI remain unverified locally; unit mocks are not reported as native execution.
