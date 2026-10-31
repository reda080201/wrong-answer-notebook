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

## Desktop follow-up

Screen shell, graph, dialog, AI and exam-status text now use rem sizing; commonly used sizes have semantic text tokens. The browser root size is unchanged. The 10px exam result status is raised to 13px equivalent. Print/A4/PDF/PNG styles were not edited. Pretendard already declares font-display: swap, so no duplicate font-face was added.

Added the first-focus skip link and a focusable content target. Detail toast and delayed-scroll tasks are tracked, cancelled on entry change/unmount, and guarded by a generation. Existing exam/bridge/update flushing remains unchanged. AI composer uses Dialog xl sizing. Global overlay bases are tokens; opened-dialog order and local sticky layers remain intact. Print/reduced-motion important overrides remain.

CSS ownership contract: 3 passed. Direct browser checks (zoom 100/200%, default font 16/20px, delayed/blocked fonts, light/dark overlay order, A4 visual comparison and direct keyboard navigation) remain unverified because browser control failed in this session. These are acceptance gates still open, not implied by passing unit/build checks. Mobile/touch and breakpoint redesign were excluded.

Follow-up results: TypeScript/Vite build passed; related Dialog/EntryDetail/AI composer tests 3 files, 62 passed; changed TSX lint 0 errors, 8 warnings (before final dependency/ref cleanup). Browser control recovered after reset: the skip link moved active focus to app-content, root computed size was 16px, and settings opened with its close control focused. The observed default viewport was narrow, so this does not fulfill the desktop viewport/zoom matrix. That matrix, font blocking and A4 comparison remain open. No new claim of complete visual acceptance.
