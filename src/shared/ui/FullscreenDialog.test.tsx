import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import FullscreenDialog from "./FullscreenDialog";

describe("FullscreenDialog", () => {
  it("uses the shared dialog focus and close behavior", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <FullscreenDialog open={open} title="전체 화면 문서" onClose={() => setOpen(false)}>
          <button type="button">본문 동작</button>
        </FullscreenDialog>
      );
    }

    render(<Harness />);

    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(screen.getByRole("dialog", { name: "전체 화면 문서" })).toHaveClass("dialog-size-fullscreen");
    expect(screen.getByRole("button", { name: "전체 화면 닫기" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "전체 화면 문서" })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
