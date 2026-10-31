# Draft lifecycle guards

Independent main-based change (6583ff6d). Draft #170/#171 and user worktrees are preserved.

## Changes and evidence

- Recovery's shared alive boolean allowed an earlier StrictMode read to update the newer mount. Request generations now guard initial reads and recovery/verification/cancellation completion and lock release. A deferred StrictMode regression checks the older empty result cannot hide the current recovery action.
- Autosave's callbacks used the latest callbacks ref for an older workspace write. Revision checks now suppress stale saved/error notifications while the existing serialized durable write continues. A delayed A write followed by B edit checks no saved callback is emitted for B.
- Scheduled deletion finalization did not catch rejected storage reads. Its timer now handles rejection, retains the ledger, exposes the existing error and schedules backed-off retries even if the error string repeats. Closing clears pending timers; no in-flight asset deletion is cancelled.
- Bridge sync is best-effort and has no current product callers. Its returned status now contains the latest context error; generations prevent earlier successes/failures changing newer results. A deferred-success/late-error regression checks this ordering. No new product notification UI was introduced for an unused hook.
- Recovery error UI separates a recovery explanation from expandable technical detail. Existing original error text remains accessible. Two test-only AUDIT console lines were removed; assertions and production diagnostics remain.

## Limits

The report's local timer cleanup/ref-null patterns are not themselves leaks. Existing exam flush catches failures, app-close flush collects failures, and download URL cleanup must remain. No memory-growth, data-loss or battery claim is made. Added failure tests were written before implementation but were not run on the unfixed baseline; they establish post-fix regressions, not a measured pre-fix failure run.

Local related run: six files/45 tests passed; additional deletion/bridge checks two files/14 tests passed before the repeated-error retry increment. Final head checks and CI are reported in the PR. No full local suite, actual user-data operations or API calls. Desktop zoom/default-font/A4 acceptance from #170 remains separate and incomplete.
