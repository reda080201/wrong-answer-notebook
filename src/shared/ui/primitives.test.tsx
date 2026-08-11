import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EmptyState from "./EmptyState";
import Field from "./Field";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Divider } from "./Divider";
import { IconButton } from "./IconButton";
import Menu from "./Menu";
import { Panel, Surface } from "./Surface";
import { ScrollArea } from "./ScrollArea";
import { Toolbar } from "./Toolbar";

describe("shared UI primitives", () => {
  it("renders a labelled field and empty state", () => {
    render(<><Field label="제목" htmlFor="title"><input id="title" /></Field><EmptyState title="비어 있음">내용이 없습니다.</EmptyState></>);
    expect(screen.getByLabelText("제목")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "비어 있음" })).toBeInTheDocument();
  });

  it("exposes stable classes and accessible button semantics", () => {
    render(
      <>
        <Button variant="primary" size="compact">저장</Button>
        <IconButton label="닫기">X</IconButton>
      </>,
    );

    expect(screen.getByRole("button", { name: "저장" })).toHaveClass(
      "ui-button",
      "ui-button--primary",
      "ui-button--compact",
    );
    expect(screen.getByRole("button", { name: "닫기" })).toHaveClass("ui-icon-button");
    expect(screen.getByRole("button", { name: "저장" })).toHaveAttribute("type", "button");
  });

  it("provides structural primitives without imposing product behavior", () => {
    render(
      <>
        <Surface data-testid="surface">표면</Surface>
        <Panel title="패널 제목" actions={<Button>작업</Button>}>내용</Panel>
        <Toolbar label="문서 도구">도구</Toolbar>
        <Divider orientation="vertical" />
        <ScrollArea aria-label="스크롤 영역">스크롤 내용</ScrollArea>
        <Badge tone="success">완료</Badge>
      </>,
    );

    expect(screen.getByTestId("surface")).toHaveClass("ui-surface", "ui-surface--default");
    expect(screen.getByRole("heading", { name: "패널 제목" })).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "문서 도구" })).toHaveClass("ui-toolbar");
    expect(screen.getByRole("separator")).toHaveAttribute("aria-orientation", "vertical");
    expect(screen.getByRole("region", { name: "스크롤 영역" })).toHaveClass("ui-scroll-area");
    expect(screen.getByText("완료")).toHaveClass("ui-badge", "ui-badge--success");
  });

  it("closes a menu with Escape", () => {
    const onClick = vi.fn();
    render(<Menu label="도구"><button type="button" onClick={onClick}>실행</button></Menu>);
    const trigger = screen.getByRole("button", { name: "도구" });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    const item = screen.getByRole("menuitem", { name: "실행" });
    expect(item).toHaveFocus();
    fireEvent.keyDown(item, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("moves through menu items with keyboard navigation", () => {
    render(<Menu label="도구"><><button type="button">첫 번째</button><button type="button">두 번째</button></></Menu>);
    fireEvent.click(screen.getByRole("button", { name: "도구" }));
    const items = screen.getAllByRole("menuitem");
    fireEvent.keyDown(items[0], { key: "ArrowDown" });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(items[1], { key: "Home" });
    expect(items[0]).toHaveFocus();
  });

  it("skips disabled menu items when moving focus", () => {
    render(<Menu label="도구"><><button type="button" disabled>사용 불가</button><button type="button">실행</button><button type="button" aria-disabled="true">잠김</button><button type="button">다음</button></></Menu>);
    fireEvent.click(screen.getByRole("button", { name: "도구" }));
    const enabledFirst = screen.getByRole("menuitem", { name: "실행" });
    expect(enabledFirst).toHaveFocus();
    fireEvent.keyDown(enabledFirst, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "다음" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "다음" }), { key: "ArrowDown" });
    expect(enabledFirst).toHaveFocus();
  });

  it("names and isolates a menu trigger", () => {
    const parentClick = vi.fn();
    render(<div onClick={parentClick}><Menu label="⋮" triggerAriaLabel="문제지 추가 자료 메뉴" stopPropagation><button type="button">자료 추가</button></Menu></div>);
    const trigger = screen.getByRole("button", { name: "문제지 추가 자료 메뉴" });
    fireEvent.click(trigger);
    expect(parentClick).not.toHaveBeenCalled();
    expect(screen.getByRole("menuitem", { name: "자료 추가" })).toBeInTheDocument();
  });
});
