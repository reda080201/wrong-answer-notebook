# Stale reads and edit preservation

Base main e687391e. Independent branch; existing PRs and user worktrees unchanged.
No public storage format/API, user data or installer replacement.

## Reproduced defects and changes

1. Review: delayed initial A read completed after restored B, then C save submitted
   A+C. refresh now issues a generation and checks it before reading/applying errors
   or results. Restore invalidates old reads and closes the loaded gate. Only a
   successful current refresh reopens it. Existing queued writes finish first.
   Ordinary backup blocking does not cancel the initial load permanently.
2. Question inspector: same-ID projection replacement discarded dirty fields,
   errors and the retry payload. Key the internal editor by item ID; within an ID,
   sync only unchanged fields. Preserve dirty fields and show conflicting field
   names with an explicit overwrite action. Retry uses the captured failed patch.
   Successful save baselines reflect the submitted patch, not newer in-flight edits.
3. Zoom: A's state was briefly persisted under B's storage key before correction.
   Key the internal viewport by storageKey so initial values belong to that key.
   Keys, bounds, defaults and restore events remain unchanged.
4. MCP: old disabled status replaced a newer listening result while config stayed
   enabled. Shared status generations cover configuration/status/test/pairing paths;
   teardown invalidates pending callbacks. Saved config is retained on follow-up
   status-query failure; runtime rollback applies to pre-persistence failure.

## Bounded verification

Luna ran three files sequentially: staleLoads (4 cases), staleUiState (3 cases),
useReviewSessions (4 cases). Final total: 11 unique cases passed.
The UI cases cover cross-key writes, same-ID failed-patch retry preservation,
dirty-field conflicts and untouched-field updates.
The hook cases cover A/B response reversal, load failure/retry, late MCP status
and config persistence followed by status-query failure.

Initial hook probes failed because the first delayed read had not started before
invalidation; a wait for actual loader invocation establishes the scenario.
MCP fixtures also re-supplied a newly allocated old prop on every render;
stable input and parent echo now model configuration ownership.
No timeout/expectation weakening. A legacy restore test assumed removing a block
was enough to save: strengthened it to reject before refresh, then preserve its
original successful-write assertion after refresh.

All persistence/native boundaries in these cases are mocked, UI is React/jsdom.
These are regression results, not live Windows, real backup-file or bridge tests.
Full local suites are not repeated; final-head CI handles them.

Final local checks: independent npm ci; lint 0 errors/59 warnings; TypeScript/Vite
build passed with existing mixed-import and large-chunk warnings; diff check passed.
Base e687391e does not include the separate #179 warning-boundary work, whose
58-warning count is not a direct before/after baseline for this branch.
Remaining warnings are not resolved by these four behavioral fixes.
