# AI request feedback and compact-list subscription

Based on Draft #170, after e014c5b6 fixes the tokenized Dialog paint-order assertion. That assertion now checks the CSS formula and relative opened-layer order, rather than coercing calc() to a number. #169 remains unchanged.

Chat reports actual question persistence, response waiting, streaming and result persistence stages. Waiting shows elapsed time from 10 seconds, with the existing stop button. No completion percentages, ETA, paid calls or external transmissions were introduced. Feedback/timer state is isolated in useRequestFeedback; authorization, request identity, cancellation and storage remain at the existing guarded boundary. Completion/failure removes the indicator.

App list compaction subscribes to matchMedia change at the existing 1100px and problem-sheet 1200px boundaries. Stored overrides and navigation remain unchanged. This avoids invoking the handler for every resize event; no CPU or battery improvement is claimed.

The feedback timer regression checks 10 seconds waiting, receive/idle cleanup, restart and unmount. Existing chat tests cover retry, cancellation, scope and write recovery. Actual provider behavior is unverified. #170 desktop zoom/default-font/A4 visual matrix remains an open acceptance gate. This change does not claim to complete that matrix or a broad component rewrite.

Local verification: initial related run 3 files/28 tests passed (including #170 paint-order regression). Changed-file lint 0 errors/3 existing warnings; TypeScript/Vite build passed with existing bundle warnings. An added integration case verifies waiting → streamed response → persisted final response and removes feedback after completion. All provider responses in these checks are mocked.
