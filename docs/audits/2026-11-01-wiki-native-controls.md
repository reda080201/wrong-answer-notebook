# Native wiki actions

Based on main 1412d350. Plain fallback wiki links and annotation-node links previously used role=button spans with hand-written activation. They now use type=button controls; Enter/Space keydown stops propagation but retains native activation. Clicks stop propagation on fallback and concept-resolved paths. This preserves target resolution while preventing parent actions and form submissions.

Button-specific visual reset inherits text size/line-height and retains existing wiki color states; keyboard focus uses the shared accent/radius. Annotation marks remain around the action. Existing button/link/input children are not recursively linkified into nested controls.

Unit regressions cover form/parent isolation, no manual keydown activation, annotation containment and nested controls. A browser harness imports the actual React wiki renderer and app CSS to check real click/Enter/Space, focus retention, annotations and KaTeX at 1100x750. The harness is synthetic and only routed by its E2E test; it is not an application route.

Broader desktop 200% zoom/default-font 20px, A4 visual comparison, real Windows screen-reader and full import/exam navigation remain open acceptance work. No broad App/Context/cache/queue rewrite or new dependencies. No measured memory/performance claims or user-data operations.
