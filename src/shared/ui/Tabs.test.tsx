import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Tabs from "./Tabs";

describe("Tabs", () => {
  it("exposes the selected tab and changes value", () => {
    const onChange = vi.fn();
    render(<Tabs items={[{ id: "one", label: "하나" }, { id: "two", label: "둘" }]} value="one" onChange={onChange} ariaLabel="탭" />);
    expect(screen.getByRole("tab", { name: "하나" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "둘" }));
    expect(onChange).toHaveBeenCalledWith("two");
  });
});
