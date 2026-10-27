import { expect, it } from "vitest";
import { questionBankSummary } from "./QuestionBankCard";

it("summarizes before choices and preserves complete formula tokens", () => {
  expect(questionBankSummary("분수 $\\frac{1}{3}$를 구하시오.\n① 1\n② 2")).toBe("분수 $\\frac{1}{3}$를 구하시오.");
  const summary = questionBankSummary("설명 ".repeat(100) + "$\\sum_{k=1}^{n} k$");
  expect(summary.length).toBeLessThanOrEqual(182);
  expect(summary).not.toContain("$\\sum");
});
