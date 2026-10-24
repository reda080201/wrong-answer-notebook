# Vitest worker startup diagnosis

## Historical failure

The preserved failure is `build-v8-full-unit-threads.log` in the earlier `vision-import-v8` worktree, lines 2344–2352. It reports:

```text
Error: [vitest-pool]: Failed to start threads worker for test files .../src/test/generatedExamSourcePageRegression.test.ts.
Caused by: Error: [vitest-pool-runner]: Timeout waiting for worker to respond
```

The run ended with 214 test files and 1,346 tests passed, plus one unhandled error. The worker-repro log shows that this test file later passed alone (2 tests, 7.06 seconds). That does not reproduce a persistent standalone failure, but does not explain the suite-only failure.

## Failure stage in installed Vitest 4.1.11

In `node_modules/vitest/dist/chunks/cli-api.CnMVyzaz.js`, `PoolRunner.start()` (around line 2956) starts the worker, attaches its message/error/exit handlers, posts the `start` request, then waits for `started` with `START_TIMEOUT = 60e3` (around line 2861). `init.k9zZ9sLh.js` handles `start` by initializing traces and awaiting `worker.setup()` before replying with `type: "started"` (around lines 200–241). The logged cause therefore establishes that the threads worker did not complete that startup handshake within 60 seconds. The outer pool has a separate 90-second runner-start guard (`WORKER_START_TIMEOUT`, around line 3462); that is not the timeout named by this stack.

The error contains no OS spawn error, worker error event, exit code, signal, or memory measurement. It does not establish whether the worker was delayed in runtime/environment initialization, blocked before processing the message, or affected by an OS/resource condition. The failure log does not record the Node patch version or worker PID. Causality remains unconfirmed.

## Current test invocation

`package.json:13` runs `vitest run --config vitest.config.ts`; `package.json:15` includes that script in `npm run check`. The config selects `pool: "forks"`, one minimum/maximum worker, `fileParallelism: false`, and `isolate: true` (`vitest.config.ts:11–16`). The CI and release workflows call `npm run test` without a `--pool=threads` override (`.github/workflows/ci.yml:105`, `.github/workflows/release.yml:70`). The historical failed log explicitly invoked `--pool=threads`, so it does not describe the current configured forks pool.

## Successful traces and limits

The later successful `npm run check` trace recorded 215 child forks, 215 spawns, 215 exits, and zero child errors. This confirms a separate forks run completed normally; it is not trace evidence for the earlier failed threads run. Likewise, the isolated test-file repro passed but cannot establish why the full threads run missed its handshake.

## Smallest useful follow-up evidence

If the failure recurs, capture one run with a temporary preload enabled from process start. The existing `trace-workers.cjs` observes `child_process.fork` and is suitable for the configured forks pool; by itself it cannot diagnose a `threads` recurrence. For that case, instrument `node:worker_threads` worker construction and record thread ID, creation/`online`, `error`, and `exit` code, plus the type and timestamp of the `started` message sent/received. Do not record message payloads or test data. Correlate those events with stderr, periodic parent/worker RSS, available/committed memory, and process/thread counts. Keep runner deadlines unchanged. Without a failure-time trace, the existing artifacts cannot distinguish slow setup from an OS/runtime resource failure.
