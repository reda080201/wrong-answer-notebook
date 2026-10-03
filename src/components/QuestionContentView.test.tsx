import { render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import QuestionContentView from "./QuestionContentView";
vi.mock("../api",()=>({getImageUrl:vi.fn().mockResolvedValue("data:image/png;base64,audit")}));
it.each([false, true])(" a figure positioned inside a choice must not be flagged as unpositioned",async (appendUnreferencedFigures) => {
  const { container } = render(<QuestionContentView text="body" segments={[{id:"body",type:"text",text:"body"}]} choices={["① [FIGURE:f]", "② other"]} figures={[{id:"f",questionNumber:"1",image:"figure.png",title:"choice figure",caption:"",source:"original"}]} appendUnreferencedFigures={appendUnreferencedFigures}/>);
  await waitFor(()=>expect(screen.getByAltText("choice figure")).toBeInTheDocument());
  expect(container.querySelectorAll("img")).toHaveLength(1);
  expect(screen.queryByText("[그림 위치 연결 확인 필요: f]")).not.toBeInTheDocument();
});
