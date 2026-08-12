# PR #64 UI Audit

## Design Read

This is a high-focus desktop learning instrument, not a SaaS landing page or a playful consumer app. People spend long sessions reading, editing, reviewing, and solving dense academic content. The visual language should be calm, precise, academic, fast, and quietly premium. Design should disappear behind the task. The operating dials are design variance 4, motion intensity 2, and visual density 7.

## Surface Findings

| Surface | Primary task | Primary action | Main consolidation need |
| --- | --- | --- | --- |
| App shell | Find and open study material | Search or open an entry | Continuous navigation and entry lists; reduce card treatment and toolbar wrapping |
| Problem sheet | Read questions and start work | Practice or real exam | Separate mode-aware resume labels; keep display control compact; move utilities to overflow |
| Question theater | Work on one question | Navigate and write an answer | Make question dominant; use icon navigation and a quiet solution divider |
| Import intake | Select and validate a source | Review or save | Hide implementation mechanics and duplicate answer/figure editors by default |
| Import review | Validate canonical question data | Save current question and continue | One active question, one source pane, persistent actions, accurate source labels |
| Text review | Correct suspicious canonical segments | Save and continue | Reuse import review workspace grammar and warning-to-segment navigation |
| Practice exam | Solve one question at a time | Respond and navigate | Share answer control/type policy with real mode while retaining focused layout |
| Real exam | Complete a timed paper | Respond and submit | Replace dashboard-like cards with paper and answer-sheet hierarchy; use safe DOM targets |
| Results | Understand mistakes | Inspect a question | Compact score summary and answer comparison before secondary detail |
| Generated exams | Open a saved set | Practice or real mode | Clarify launch mode and reduce equal-weight action clusters |
| Settings | Configure durable preferences | Save a local decision | Consistent section rhythm, controls, validation, and semantic notices |

## Cross-Cutting Debt

- Tokens are incomplete: feature CSS still invents colors, spacing, radii, and shadows.
- Borders and rounded surfaces are used where spacing or dividers would communicate grouping more clearly.
- Metadata is frequently rendered as badges even when it is not status information.
- Toolbars expose too many actions at equal weight and wrap poorly around 1100px.
- Import and Text Review implement similar three-pane workspaces with different visual grammar.
- Real exam question IDs use raw question numbers and answer-control decisions are duplicated.
- Playwright covers shell mechanics but not the import and exam data lifecycle.

## Non-Negotiable Product Contracts

This consolidation must preserve structured-question canonical identity, ordered content segments, import staging rollback, direct reviewed import save, practice/real mode separation, absolute deadlines, mode-aware resume, answer-sheet persistence, guarded atomic submission, MCP isolation during real exams, trusted-points scoring, and tolerant legacy session normalization.
