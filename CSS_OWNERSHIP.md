# CSS Ownership

Touched geometry has one authoritative owner:

- `ui-foundation.css`: shell, sidebar, entry-card geometry and responsive shell constraints.
- `ui-consolidation.css`: entry detail toolbar hierarchy and migrated detail actions.
- `dialog-shell.css`: portal dialog surface, focus and scroll ownership.
- `legacy/*.css`: compatibility rules only; migrated entry/detail selectors are forbidden.

New breakpoints use `640px`, `768px`, `1100px`, and `1440px`. A legacy selector remains only while its owning surface has not migrated, and must be added to the contract allowlist before reuse.
