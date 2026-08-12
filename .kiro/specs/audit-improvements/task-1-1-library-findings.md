# Task 1.1: Library Folders Persistence Investigation

**Status**: ✅ COMPLETE  
**Date**: 2026-08-09

## Findings

`useLibraryFolders` persists via a serial task queue (`useSerialTaskQueue`):
- `mutate()` enqueues `saveLibraryFolders` immediately (not debounced localStorage)
- `flush` exposes `drain()` so callers can await in-flight saves

## Race

Without close-guard integration, an in-flight save could be interrupted on abrupt quit.

## Resolution (Task 1.2)

`flushLibraryFolders: library.flush` is passed into `useWindowCloseGuard` → `flushPendingAppWrites`, so close waits for library persistence within the 15s timeout.
