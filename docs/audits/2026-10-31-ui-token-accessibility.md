# UI tokens and interaction semantics

Based on main `6583ff6d`; independent of Draft #169.

## Confirmed changes

- Undefined radius, metadata typography, review state and warning references now use defined semantic tokens. Warning colors cover light and dark themes.
- Common button radii agree across base styles. Solution paper remains intentionally white; its local palette is named explicitly. Sheet corners and controls use standard radii, hotspots use the app accent.
- Settings, annotation tools and AI composer close use decorative Lucide SVGs with existing Korean labels.
- Question-bank keyboard focus has a 2px outline and offset.
- Composition mode controls expose a selected disabled current mode; transitions retain existing save/protection handling. Composer buttons explicitly use button type.
- The sheet library uses a heading and generated-exam action rather than presenting a modal opener as a tab.

## Evidence limits

The report's missing-event claims were not confirmed: the direct-mode button was already the active mode; returning from AI uses the existing draft-close path. Generated exams opens a dialog. A bare JSX aria-pressed evaluates to true. These were misleading interaction semantics, not confirmed lost navigation.

The browser-control tool failed before navigation with `failed to write kernel assets: path not found (os error 3)`. Consequently light/dark screenshots, 1100/680 layouts, and direct keyboard checks are not verified in this pass. No visual completion claim is made.

No persistence/API changes, user-data operations, paid API calls, installation replacement or changes to #169.
