# CSS Ownership

This document records the stylesheet owner for each converging UI surface. A
surface should receive new rules in its owner stylesheet; legacy files remain
the compatibility source for selectors that have not yet been migrated.

| Surface | Owner | Responsibility |
| --- | --- | --- |
| Settings | `src/styles/settings.css` | Settings modal layout, tabs, panels, and preference controls. |
| Learning Hub | `src/features/learning/learningHub.css`, `src/styles/learning-hub-foundation.css` | Learning Hub content, filters, cards, source pickers, and acceptance layout. |
| Question Bank | `src/features/question-bank/questionBank.css` | Question Bank filters, result list, cards, detail view, and actions. |
| Lecture | `src/styles/legacy/07-app-styles.css`, `src/styles/lecture.css` | Lecture reader structure and document/card presentation foundations. |
| Sidebar | `src/styles/ui-foundation.css` | App shell, sidebar sizing, sidebar scroll region, entry list, and list density. |
| Problem Sheet/Search | `src/components/StudyPaperView.css`, `src/styles/problem-sheet.css` | Structured question rendering and toolbar search behavior. Legacy problem-sheet selectors remain compatibility-only until their JSX consumers move. |
| Dialog | `src/shared/ui/Dialog.tsx`, `src/styles/dialog-shell.css`, `src/styles/dialog-foundation.css` | Dialog shell geometry, shared dialog scroll ownership, import dialog layout, and dialog typography. |

## Foundation Rules

- `src/styles/tokens.css` owns shared font, spacing, color, radius, motion, and
  type tokens.
- `--font-ui` is used by the app shell, controls, and dialogs. `--font-content`
  remains the content type token for reading surfaces.
- KaTeX keeps its package-provided font rules. `pre`, `code`, `kbd`, and `samp`
  use `--font-mono` and are not replaced by the UI font.
- The document and root do not scroll. Shell, pane, content, and dialog
  regions explicitly own their scroll containers with `min-width: 0` and
  `min-height: 0` where they participate in a flex or grid layout.
- `src/styles/ui-foundation.css` and the feature foundation sheets are imported
  after legacy application chunks in `src/App.css` when they need to establish
  the converged shell behavior. Global feature sheets are imported from
  `src/index.css`.
