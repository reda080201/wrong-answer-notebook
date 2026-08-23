# CSS Ownership

The application uses the following ownership boundaries for new and migrated styles:

| Surface | Owner | Notes |
| --- | --- | --- |
| app shell and sidebar | `ui-foundation.css` | Grid geometry, collapse widths, and shell overflow live here. |
| entry list and rows | `ui-foundation.css` | Divider rows and entry-pane sizing are owned here. |
| entry detail | `ui-consolidation.css` and feature-local styles | Detail-specific selectors must use a `detail-` or feature prefix. |
| import workspace | `features/import*` styles | Import selectors must not redefine shell geometry. |
| settings | `settings.css` and settings component styles | Dialog sizing belongs to the shared Dialog primitive. |
| exam | `exam.css` and exam feature styles | Paper/session layout is isolated from entry-list geometry. |

The legacy files remain loaded for compatibility while migration is in progress. A legacy selector is removed only after its owning surface has a replacement and a regression test. New code uses the product breakpoints `640px`, `768px`, `1100px`, and `1440px`; untouched legacy rules are intentionally left in place until their surface is migrated.
