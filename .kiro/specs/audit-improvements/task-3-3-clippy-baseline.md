# Task 3.3 — Clippy baseline

Date: 2026-08-09

## Command

```bash
cd src-tauri && cargo clippy --all-targets --all-features
```

(Local run also used `--message-format=short` for easier counting; same warnings.)

## Summary

| Target | Warnings |
|--------|----------|
| lib | 10 |
| lib test | 14 (10 duplicates of lib) |
| **Unique warnings** | **14** |

Exit code: `0` (warnings only; no errors).

## Sample warnings (all unique)

1. `src/lib.rs:862` — deprecated `images::save_image` (use `save_image_from_dialog`)
2. `src/ai.rs:539` — needless `as_bytes()` before `.len()`
3. `src/ai.rs:544` — needless `as_bytes()` before `.len()`
4. `src/ai.rs:551` — needless `as_bytes()` before `.len()`
5. `src/backup.rs:182` — needless borrow (`path` already implements required traits)
6. `src/backup.rs:483` — `std::mem::drop` on non-`Drop` value
7. `src/mcp_bridge.rs:626` — large `Err` variant (≥128 bytes)
8. `src/notebook_store/mod.rs:310` — `map_or` can be simplified
9. `src/notebook_store/mod.rs:313` — `map_or` can be simplified
10. `src/notebook_store/mod.rs:669` — `skip_while(<p>).next()` on iterator
11. `src/lib.rs:461` — items after a test module
12. `src/ai.rs:714` — `assert_eq!` with a literal bool
13. `src/notebook_store/mod.rs:852` — unnecessary `clone` for slice (`from_ref`)
14. `src/notebook_store/mod.rs:882` — unnecessary `clone` for slice (`from_ref`)

## Notes

- Warnings were **not** fixed in this task (deferred to 4.2).
- Running with `--all-features` updated `src-tauri/Cargo.lock` (resolved additional transitive crates such as `rfd` feature deps). Keep the lockfile change so CI clippy matches local resolution.
