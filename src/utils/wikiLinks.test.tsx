import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createTextAnnotation, renderAnnotatedText } from "./annotations";
import { LinkifiedText, parseWikiLinks, renderWikiLinksInNodes } from "./wikiLinks";

describe("wiki links", () => {
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
