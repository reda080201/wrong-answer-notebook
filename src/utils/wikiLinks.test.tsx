import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createTextAnnotation, renderAnnotatedText } from "./annotations";
import { LinkifiedText, parseWikiLinks, renderWikiLinksInNodes } from "./wikiLinks";

describe("wiki links", () => {
  it("does not nest wiki buttons inside an existing control", () => {
    const activate = vi.fn();
    const { container } = render(<>{renderWikiLinksInNodes([<button key="action">[[Algebra]]</button>], activate, new Set())}</>);
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(container.querySelector("button button")).toBeNull();
    expect(screen.getByRole("button")).toHaveTextContent("[[Algebra]]");
  });
  it.each([false, true])("uses native non-submit controls without activating parent handlers (annotation=%s)", (annotated) => {
    const activate = vi.fn(), parent = vi.fn(), submit = vi.fn();
    render(<form onSubmit={submit}><div onClick={parent} onKeyDown={parent}>{annotated ? renderWikiLinksInNodes([<mark key="m">[[Algebra|대수]]</mark>], activate, new Set()) : <LinkifiedText text="[[Algebra|대수]]" onLinkClick={activate} existingTargets={new Set()} />}</div></form>);
    const button = screen.getByRole("button", { name: "대수" });
    expect(button.tagName).toBe("BUTTON"); expect(button).toHaveAttribute("type", "button");
    fireEvent.keyDown(button, { key: "Enter" }); fireEvent.keyDown(button, { key: " " });
    expect(activate).not.toHaveBeenCalled(); // Native keyboard activation is checked in-browser, not synthesized here.
    fireEvent.click(button);
    expect(activate).toHaveBeenCalledTimes(1); expect(parent).not.toHaveBeenCalled(); expect(submit).not.toHaveBeenCalled();
    if (annotated) expect(button.closest("mark")).not.toBeNull();
  });
  it("parses target and label variants", () => {
    expect(parseWikiLinks("A [[Target|Label]] B [[Other]]")).toMatchObject([
      { isLink: false, raw: "A " },
      { isLink: true, target: "Target", label: "Label" },
      { isLink: false, raw: " B " },
      { isLink: true, target: "Other", label: "Other" },
      { isLink: false, raw: "" },
    ]);
  });

  it("renders clickable wiki links", () => {
    const onLinkClick = vi.fn();

    render(
      <LinkifiedText
        text="See [[Algebra|대수]]"
        onLinkClick={onLinkClick}
        existingTargets={new Set(["algebra"])}
      />,
    );

    const link = screen.getByRole("button", { name: "대수" });
    link.click();

    expect(onLinkClick).toHaveBeenCalledWith("Algebra");
  });

  it("preserves annotation marks while linkifying annotated text", () => {
    const annotation = createTextAnnotation(0, 12, "highlight");
    const nodes = renderAnnotatedText("[[Algebra]]", [annotation]);
    const linked = renderWikiLinksInNodes(nodes, vi.fn(), new Set(["algebra"]));

    render(<div>{linked}</div>);

    expect(screen.getByRole("button", { name: "Algebra" })).toBeInTheDocument();
  });
});
