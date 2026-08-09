# Task 1.5 / 1.6: CSP Inline Audit & Hardening

**Status**: ✅ COMPLETE  
**Date**: 2026-08-09

## Findings (1.5)

| Pattern | Result |
|---------|--------|
| `dangerouslySetInnerHTML` with scripts | None |
| `eval()` / `new Function` | None |
| Inline event handlers in HTML | None |
| Inline `<script>` in `index.html` | One theme bootstrap script |

React event handlers use `addEventListener` under the hood (React 19). KaTeX injects CSS, not scripts.

## Hardening (1.6)

1. Moved theme bootstrap to `public/theme-boot.js`
2. `index.html` loads `/theme-boot.js` as an external script (before React)
3. Removed `script-src 'unsafe-inline'` from `src-tauri/tauri.conf.json`

**New script-src**: `'self' ipc: http://ipc.localhost`

## Interim exception

`style-src` still allows `'unsafe-inline'` for KaTeX/runtime styles. Removal is deferred to optional Task 4.1.

## Verification

- Theme FOUC prevention: external script still runs before `#root` mount
- No nonce required (Tauri CSP is static; external file + `'self'` is sufficient)
