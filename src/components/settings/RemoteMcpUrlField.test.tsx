import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import RemoteMcpUrlField from "./RemoteMcpUrlField";

it("saves URL edits in order and preserves the latest input on failure", async () => {
  let finish!: () => void;
  const save = vi.fn<(value: string) => Promise<void>>()
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockRejectedValueOnce(new Error("저장 실패"))
    .mockResolvedValue(undefined);
  render(<RemoteMcpUrlField value="" save={save} />);
  const field = screen.getByRole("textbox", { name: /외부 HTTPS MCP 기본 URL/ });
  fireEvent.change(field, { target: { value: "https://first.example" } });
  fireEvent.blur(field);
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  fireEvent.change(field, { target: { value: "https://second.example" } });
  fireEvent.blur(field);
  expect(save).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  expect(await screen.findByRole("alert")).toHaveTextContent("저장 실패");
  expect(field).toHaveValue("https://second.example");
  fireEvent.click(screen.getByRole("button", { name: "저장 재시도" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("저장했습니다."));
  expect(save.mock.calls.map(([value]) => value)).toEqual(["https://first.example", "https://second.example", "https://second.example"]);
});
