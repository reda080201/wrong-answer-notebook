# Import shapes, figure labels and storage measurements

Based on main 1412d350. No storage migration, new runtime dependency, external logging, paid calls or user-data changes.

## Reproduction and fixes

Luna ran importValidation.test.ts before fixes: 5 failed / 5 passed. Object/string/number crop containers threw when entries() was called; null and malformed items silently escaped blocking validation. Containers and items now generate indexed blocking issues, including missing questionNumber/image. Valid legacy crops retain their existing coordinate policy; malformed input is not silently normalized away.

Canonical presentation now narrows a local optional segment variable rather than using a non-null assertion. Duplicate supplement, condition label and intentional formula repetition logic remains unchanged. Figure comparison/overlay alt names use the question, figure ID, existing title/caption and original/candidate role; absent descriptions are not invented.

## Synthetic browser measurement

Reproduce: `node scripts/measure-browser-storage.mjs`. A new headless Chromium context and ephemeral loopback HTTP server are created/closed by the script. Each dataset is written/requested 3 times. Objects contain synthetic repeated Korean question text and image names, not image bytes. These counts are benchmark operations, not measured app autosave frequency.

| Entries | UTF-8 payload | Median stringify | Median localStorage setItem | Median loopback request |
| --- | --- | --- | --- | --- |
| 30 | 283,141 bytes | 1.30 ms | 2.20 ms | 42.90 ms |
| 300 | 2,832,001 bytes | 25.80 ms | 21.80 ms | 343.40 ms |

Ranges: 30 entries stringify 1.10–4.20ms, setItem 2.00–5.90ms, request 40.90–65.20ms; 300 entries stringify 22.90–29.20ms, setItem 21.70–26.20ms, request 290.40–355.90ms. The machine had concurrent activity. No improvement percentage is claimed. Loopback requests do NOT measure the actual authenticated desktop proxy, network or Rust durable writes. Actual Windows/native and desktop-proxy timings remain unverified.

Follow-up proposal: measure the real app's save frequency and actual proxy/native boundary before selecting optimization. The isolated-browser serialization+write cost merits investigating larger payloads; it does not establish a Critical Windows-app bottleneck. Keep format, queues and backend routing unchanged for this patch.

## Minimal verification

Luna's post-fix sequence: importValidation 10 passed, questionPresentation 10 passed, FigureComparisonPanel 4 passed (3 distinct files). Empty-object/blank-image item cases were added after the first file run and are checked separately with only that changed test selected. No full local suite or storage-store suite is rerun. Final lint/build/CI and the additional selected-test result are recorded in the PR.

Prior desktop zoom/default-font/A4/overlay visual acceptance remains open. Reported Worker/localStorage example is invalid; browser images already use IndexedDB when supported, while native data uses Tauri and proxy payloads use JSON requests. Diagnostic logs and download URL cleanup are retained.

Luna's final additional item-boundary selection passed (1 selected test; 9 unselected by name filter, no skip added). Raw benchmark samples are in 2026-11-01-storage-measurement.json. Initial lint/build found a newly unused canonical flag and missing browser-global declarations in the measurement script; both were corrected and failed checks repeated only after changes. Existing figure-effect dependency warning remains. Actual app save frequency, Windows storage and real proxy timing are unverified, so the performance investigation is partial rather than a completed native bottleneck diagnosis.
