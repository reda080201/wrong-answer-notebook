import type { ChatGptSharePayload, ChatGptSharePayloadQuestion } from "../types";

function segmentText(question: ChatGptSharePayloadQuestion): string[] {
  return (question.contentSegments ?? []).map((segment) => {
    if (segment.type === "text") return segment.text;
    if (segment.type === "condition") return [segment.label, segment.text].filter(Boolean).join(" ");
    if (segment.type === "equation") return segment.latex;
    if (segment.type === "table") return segment.rows.map((row) => row.join(" | ")).join("\n");
    return "";
  }).filter((value) => value.trim());
}

export function buildChatGptSharePrompt(payload: ChatGptSharePayload, instruction: string): string {
  const questions = payload.questions.map((question) => {
    const sections = [
      question.questionText ? "문제:\n" + question.questionText : "",
      question.passage ? "지문:\n" + question.passage : "",
      ...segmentText(question).map((value) => "문항 내용:\n" + value),
      question.choices.length ? "선택지:\n" + question.choices.join("\n") : "",
      question.userResponse ? "내 답:\n" + question.userResponse : "",
      question.scratchNote ? "풀이 메모:\n" + question.scratchNote : "",
      question.answer ? "정답:\n" + question.answer : "",
      question.explanation ? "해설:\n" + question.explanation : "",
    ].filter(Boolean);
    return ["문항 " + question.questionNumber, ...sections].join("\n\n");
  });
  const hasOfficialAnswers = payload.answerProtection === "released" && payload.questions.some((question) => question.answer || question.explanation);
  const guardrail = hasOfficialAnswers
    ? "아래에 표시된 공유 문항 정보만 사용해 답변해 주세요."
    : "아래에 표시된 공유 문항 정보만 사용하고, 제공되지 않은 내 답·풀이 메모·정답·공식 해설이 있다고 가정하거나 비교하지 마세요.";
  return [instruction.trim(), guardrail, ...questions].filter(Boolean).join("\n\n");
}
