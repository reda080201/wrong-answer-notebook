# Desktop workflow guidance

Independent branch from main 6583ff6d. Parent-thread branches and user data are untouched.

## Changes

- Import progress respects indeterminate callbacks even when a total is present; its accessible name identifies source analysis. Explains that analysis precedes saving and completion time is unknown.
- Recognized transport/quota/missing-file failures receive actionable wording; technical text remains in a disclosure. Specific validation/partial-save messages remain intact. Applied to visual and text import errors.
- Data-operation lock is set synchronously before callbacks run, rejects duplicate clicks, catches synchronous and asynchronous failures, and clears the previous message at start. No success is inferred from a cancelled picker.
- MCP is a collapsible advanced connection section with status, automatically visible while enabled or failing. API chat and external MCP purposes are distinguished. Authentication controls are unchanged.
- Practice and real-exam submission confirmation explain finalization and the existing save-on-close route. Close tooltips describe saving for later; existing button accessible names and persistence paths are preserved.

## Existing behavior retained

Image LRU eviction, IndexedDB writes, serialized entry persistence, search over all candidates, batching and export were inspected and not reimplemented. Data panel already describes backup/restore replacement effects. No false generic success banner or unsafe automatic retry was added.

## Open acceptance gates

Direct desktop 1100x750/1280x720 light/dark, keyboard/focus, storage-failure injection, import cancel/re-entry and backup/restore round trips have not been executed in this side conversation. No responsive geometry, mobile or print changes were made without a reproduction. A direct saved-entry completion action requires the actual saved ID at the parent callback; this patch does not fabricate one. Overall desktop plan remains partial until those gates and final CI pass. No paid provider calls, merge or installer replacement.
