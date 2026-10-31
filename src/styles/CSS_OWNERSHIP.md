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

## Desktop typography and overlays

Screen typography uses rem-based `--text-caption/helper/ui/body/section/heading/dialog-title/title/page/display` tokens. Keep the browser root size; do not set a fixed html font size. Use `--type-*` for complete font shorthand, not a font-size value. Example: `font-size: var(--text-ui); line-height: 1.6`. A4/PDF/PNG styles retain their own physical typography and measurement contract.

Use spacing tokens for new controls (`gap: var(--space-2)`) and `--radius-control/panel/dialog` for controls, surfaces and dialogs. Do not migrate unrelated legacy selectors in a feature patch.

AI launcher/panel use `--z-ai-launcher/panel`. Fullscreen fallback uses `--z-fullscreen`, solution fallback uses `--z-solution`. Portal Dialogs use `calc(var(--z-dialog-stack) + openedLayer)` so a later confirmation is above its opener. Dialog-scoped notifications remain inside their owning dialog. Local sticky controls retain their local stacking values; do not flatten them into the global scale. Preserve print and reduced-motion overrides.

AI composer requests the shared Dialog `xl` size instead of overriding its width with !important. Keyboard controls use a visible focus outline; the app's first focusable link moves focus to `#app-content`.
