# Wrong Answer Notebook Design Foundation

Wrong Answer Notebook is a quiet academic instrument: a place for repeated study work, not a marketing surface. The interface makes the next useful action obvious, keeps academic content dominant, and makes saved state trustworthy.

- `DESIGN_VARIANCE`: 4/10
- `MOTION_INTENSITY`: 2/10
- `VISUAL_DENSITY`: 7/10

## OPERATE

- Orient: show the current section, entry, question, and save state.
- Prioritize: keep one primary action in each decision region; move rare actions to menus.
- Respect: preserve reading order, focus, selections, and recovery paths.
- Act: name concrete actions and expose busy, success, and error states.
- Trust: never imply save, share, backup, or submission success before completion.
- Expose: place warnings where they affect a decision.

## Visual language

Use the semantic tokens in `src/styles/tokens.css`. Neutrals carry the interface; one blue accent marks focus, selection, and primary actions. Semantic colors are reserved for blocking errors, review warnings, success, and unanswered states.

Spacing follows `4, 8, 12, 16, 20, 24, 32, 40px`; controls use `32px` compact and `38px` standard heights; radii are `6, 8, 12px`. In-flow content uses whitespace and dividers before surfaces and shadows. Shadows belong to dialogs and transient popovers.

Question content is always more prominent than application chrome. Repeated data reads as a list, document, table, or answer sheet rather than nested cards. Icon-only actions use Lucide, an accessible name, and a tooltip where needed.

## Workspaces

Import Review and structured Text Review share a navigator/editor/source/action layout. Practice and real exam share answer controls while retaining their distinct focus. Narrow desktop windows collapse secondary panes and commands before allowing overlap or uncontrolled toolbar wrapping.

This foundation is visual only. Structured question identity, persistence, import rollback, atomic submission, and MCP isolation remain authoritative.
