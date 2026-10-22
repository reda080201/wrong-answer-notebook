"""Render only explicit geometry/functions. No source interpretation is done here."""
import io
import warnings

from .expression import Expression
from .security import PipelineError, dimensions, number


def redraw(spec):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np

    if not isinstance(spec, dict) or spec.get("confirmed") is not True:
        raise PipelineError("Redraw requires a human-reviewed explicit spec (not app approval)")
    width, height = spec.get("size", [1000, 650])
    dimensions(width, height)
    if width * height > 4_000_000:
        raise PipelineError("Redraw is limited to 4MP per crop")
    kind = spec.get("type")
    if kind not in ("number_line", "plane_geometry", "function_graph", "table"):
        raise PipelineError("Unsupported explicit diagram type")
    if kind == "table" and spec.get("pngRequired") is not True:
        raise PipelineError("Use a table contentSegment; set pngRequired only for an explicitly reviewed visual grid")
    plt.rcParams.update({"text.usetex": False, "font.family": "DejaVu Sans", "svg.hashsalt": "diagram-pipeline-v1", "path.simplify": False})
    fig, ax = plt.subplots(figsize=(width / 150, height / 150), dpi=150)
    messages = []
    try:
        xlim = list(map(number, spec.get("xlim", [-5, 5])))
        ylim = list(map(number, spec.get("ylim", [-4, 4])))
        if len(xlim) != 2 or len(ylim) != 2 or xlim[0] >= xlim[1] or ylim[0] >= ylim[1]:
            raise PipelineError("Invalid graph bounds")
        ax.set_xlim(xlim)
        ax.set_ylim(ylim)
        if kind != "table":
            ax.set_aspect("equal", adjustable="box")
        ax.axis("off")

        def line(xs, ys, style="solid", **kwargs):
            if style not in ("solid", "dashed"):
                raise PipelineError("Unsupported line style")
            ax.plot([number(x) for x in xs], [number(y) for y in ys], color="black", linewidth=1.5, linestyle="--" if style == "dashed" else "-", **kwargs)

        def label(x, y, text):
            if not isinstance(text, str) or len(text) > 256:
                raise PipelineError("Invalid label")
            ax.text(number(x), number(y), text, fontsize=13, ha="center", va="bottom")

        points = spec.get("points", [])
        if not isinstance(points, list) or len(points) > 200:
            raise PipelineError("Too many points")
        by_id = {}
        for point in points:
            key = point.get("id")
            if not isinstance(key, str) or key in by_id:
                raise PipelineError("Missing/duplicate point ID")
            by_id[key] = (number(point["x"]), number(point.get("y", 0)))
        for segment in spec.get("segments", []):
            a, b = by_id[segment["from"]], by_id[segment["to"]]
            line([a[0], b[0]], [a[1], b[1]], segment.get("style", "solid"))
        for circle in spec.get("circles", []):
            center = by_id[circle["center"]]
            radius = number(circle["radius"])
            if radius <= 0:
                raise PipelineError("Circle radius must be positive")
            ax.add_patch(plt.Circle(center, radius, fill=False, edgecolor="black", linewidth=1.5))
        for region in spec.get("regions", []):
            vertices = [by_id[key] for key in region["points"]]
            ax.add_patch(plt.Polygon(vertices, facecolor="0.85", edgecolor="none", hatch=region.get("hatch", "//"), zorder=0))
        for mark in spec.get("marks", []):
            a, v, b = [np.array(by_id[key]) for key in mark["points"]]
            u, w = a - v, b - v
            if min(np.linalg.norm(u), np.linalg.norm(w)) == 0:
                raise PipelineError("Degenerate relation mark")
            if mark["type"] == "right_angle":
                if abs(np.dot(u, w)) > 1e-7 * np.linalg.norm(u) * np.linalg.norm(w):
                    raise PipelineError("Explicit coordinates contradict the right-angle mark")
                u, w = u / np.linalg.norm(u) * .18, w / np.linalg.norm(w) * .18
                p = [v + u, v + u + w, v + w]
                line([q[0] for q in p], [q[1] for q in p])
            else:
                raise PipelineError("Unknown relation mark")
        for relation in spec.get("relations", []):
            a, b, c, d = [np.array(by_id[key]) for key in relation["points"]]
            u, v = b - a, d - c
            norms = np.linalg.norm(u) * np.linalg.norm(v)
            if norms == 0:
                raise PipelineError("Degenerate relation")
            kind_relation = relation["type"]
            if kind_relation == "parallel":
                if abs(u[0] * v[1] - u[1] * v[0]) > 1e-7 * norms:
                    raise PipelineError("Coordinates contradict parallel relation")
            elif kind_relation == "equal_length":
                if abs(np.linalg.norm(u) - np.linalg.norm(v)) > 1e-7:
                    raise PipelineError("Coordinates contradict equal-length relation")
            else:
                raise PipelineError("Unsupported relation")
            for first, second in ((a, b), (c, d)):
                mid = (first + second) / 2
                direction = (second - first) / np.linalg.norm(second - first)
                normal = np.array([-direction[1], direction[0]]) * .1
                line([mid[0] - normal[0], mid[0] + normal[0]], [mid[1] - normal[1], mid[1] + normal[1]])
                if kind_relation == "parallel":
                    line([mid[0] - normal[0], mid[0] + direction[0] * .15], [mid[1] - normal[1], mid[1] + direction[1] * .15])
        if kind == "number_line":
            ax.annotate("", xy=(xlim[1], 0), xytext=(xlim[0], 0), arrowprops={"arrowstyle": "->", "color": "black"})
            for region in spec.get("intervals", []):
                a, b = map(number, region["bounds"])
                if a >= b:
                    raise PipelineError("Invalid interval")
                ax.plot([a, b], [0, 0], color="0.5", linewidth=7, solid_capstyle="butt", zorder=0)
        if kind == "function_graph":
            line(xlim, [0, 0])
            line([0, 0], ylim)
            for tick in spec.get("xticks", []):
                x = number(tick)
                line([x, x], [-.07, .07])
                label(x, -.38, str(tick))
            for tick in spec.get("yticks", []):
                y = number(tick)
                line([-.07, .07], [y, y])
                label(-.3, y, str(tick))
            for curve in spec.get("curves", []):
                expression = Expression(curve["expression"])
                for bounds in curve["intervals"]:
                    a, b = map(number, bounds)
                    if a >= b or a < xlim[0] or b > xlim[1]:
                        raise PipelineError("Explicit curve intervals must fit xlim")
                    xs = np.linspace(a, b, 1601)
                    ys = []
                    for x in xs:
                        try:
                            ys.append(expression(float(x)))
                        except (ValueError, OverflowError, ZeroDivisionError, PipelineError):
                            ys.append(float("nan"))
                    ys = np.array(ys)
                    if np.isfinite(ys).sum() < 2 or not np.any((ys >= ylim[0]) & (ys <= ylim[1])):
                        raise PipelineError("The explicit curve has no drawable samples inside its declared bounds")
                    # Never connect samples across undefined values or large jumps.
                    jumps = np.where(np.abs(np.diff(ys)) > (ylim[1] - ylim[0]) / 2)[0]
                    ys[jumps + 1] = np.nan
                    ax.plot(xs, ys, color="black", linewidth=1.5, linestyle="--" if curve.get("style") == "dashed" else "-")
            for region in spec.get("functionRegions", []):
                a, b = map(number, region["bounds"])
                if a >= b:
                    raise PipelineError("Invalid shading bounds")
                xs = np.linspace(a, b, 401)
                lower, upper = Expression(region["lower"]), Expression(region["upper"])
                lows, highs = [lower(float(x)) for x in xs], [upper(float(x)) for x in xs]
                if any(low > high for low, high in zip(lows, highs)):
                    raise PipelineError("Shading bounds cross")
                ax.fill_between(xs, lows, highs, color="0.85", hatch="//")
        if kind == "table":
            rows = spec.get("rows", [])
            if not rows or len(rows) > 100 or any(not isinstance(row, list) or len(row) != len(rows[0]) or len(row) > 30 for row in rows):
                raise PipelineError("Invalid table; use original for merged cells")
            ax.table(cellText=rows, loc="center", cellLoc="center").auto_set_font_size(False)
            messages.append("Prefer a table contentSegment; PNG preserves only the explicit grid")
        for point in points:
            x, y = by_id[point["id"]]
            if point.get("marker", True):
                ax.plot(x, y, "o", markersize=7, markerfacecolor="white" if point.get("open") else "black", markeredgecolor="black", zorder=5)
            if point.get("label"):
                label(x + number(point.get("labelDx", 0)), y + number(point.get("labelDy", .12)), point["label"])
        for item in spec.get("labels", []):
            label(item["x"], item["y"], item["text"])
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            fig.canvas.draw()
            renderer = fig.canvas.get_renderer()
            for text in ax.texts:
                bounds = text.get_window_extent(renderer)
                if bounds.x0 < 0 or bounds.y0 < 0 or bounds.x1 > width or bounds.y1 > height:
                    raise PipelineError("Label extends beyond the PNG; use original or fix reviewed layout")
            output = io.BytesIO()
            fig.savefig(output, format="png", dpi=150, facecolor="white", metadata={"Software": "diagram-pipeline-v1"})
            if any("Glyph" in str(w.message) for w in caught):
                raise PipelineError("Missing font glyph; original retained")
        return output.getvalue(), messages
    finally:
        plt.close(fig)
