import { Trash2 } from "lucide-react";
import { useState, type ChangeEvent, type ReactNode } from "react";
import { Badge, Button } from "../../../shared/ui";
import MathText from "../../../components/MathText";
import type { SheetAnswerItem } from "../../../types";
import "../../../styles/import-answer-review-list.css";

export type ImportAnswerReviewPatch = Partial<SheetAnswerItem>;

export interface ImportAnswerReviewListProps {
  items: SheetAnswerItem[];
  onUpdate(id: string, patch: ImportAnswerReviewPatch): void;
  onRemove(id: string): void;
  defaultDetailsOpen?: boolean;
}

const DIFFICULTY_LABELS: Record<NonNullable<SheetAnswerItem["difficulty"]>, string> = {
  high: "어려움",
  medium: "보통",
  low: "쉬움",
  none: "난이도 미지정",
};

function difficultyLabel(item: SheetAnswerItem): string {
  return item.difficulty ? DIFFICULTY_LABELS[item.difficulty] : "난이도 미지정";
}

function linesToText(values?: string[]): string {
  return (values ?? []).join("\n");
}

function textToLines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function judgementsToText(item: SheetAnswerItem): string {
  return (item.choiceJudgements ?? [])
    .map(({ marker, text }) => [marker, text].filter(Boolean).join(": "))
    .join("\n");
}

function textToJudgements(value: string): NonNullable<SheetAnswerItem["choiceJudgements"]> {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(":");
      if (separator < 0) return { marker: "", text: line };
      return { marker: line.slice(0, separator).trim(), text: line.slice(separator + 1).trim() };
    });
}

function ReviewField({
  label,
  htmlFor,
  defaultOpen,
  children,
}: {
  label: string;
  htmlFor: string;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details
      className="import-answer-review-field"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{label}</summary>
      <label className="import-answer-review-field-label" htmlFor={htmlFor}>
        {label} 편집
      </label>
      {children}
    </details>
  );
}

function updateText(
  onUpdate: ImportAnswerReviewListProps["onUpdate"],
  item: SheetAnswerItem,
  field: keyof Pick<SheetAnswerItem, "answer" | "explanation" | "strategy" | "wrongPoint" | "reviewPoint" | "notes">,
) {
  return (event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    onUpdate(item.id, { [field]: event.target.value });
  };
}

function AnswerRow({
  item,
  onUpdate,
  onRemove,
  defaultDetailsOpen,
}: {
  item: SheetAnswerItem;
  onUpdate: ImportAnswerReviewListProps["onUpdate"];
  onRemove: ImportAnswerReviewListProps["onRemove"];
  defaultDetailsOpen: boolean;
}) {
  const fieldId = (name: string) => `import-answer-${item.id}-${name}`;

  return (
    <article className="import-answer-review-card" aria-labelledby={fieldId("title")}>
      <header className="import-answer-review-card-header">
        <div className="import-answer-review-card-heading">
          <h3 id={fieldId("title")}>{item.questionNumber}번</h3>
          <Badge tone="neutral" size="compact">{difficultyLabel(item)}</Badge>
          {item.needsReview && <Badge tone="warning" size="compact">검토 필요</Badge>}
        </div>
        <Button
          aria-label={`${item.questionNumber}번 답안 삭제`}
          className="import-answer-review-remove"
          size="compact"
          variant="danger"
          title={`${item.questionNumber}번 답안 삭제`}
          onClick={() => onRemove(item.id)}
        >
          <Trash2 size={15} aria-hidden="true" />
          삭제
        </Button>
      </header>

      <div className="import-answer-review-answer">
        <label className="import-answer-review-number-field" htmlFor={fieldId("number")}>
          <span>문항 번호</span>
          <input
            id={fieldId("number")}
            aria-label={`${item.questionNumber || "답안"} 문항 번호`}
            value={item.questionNumber}
            onChange={(event) => onUpdate(item.id, { questionNumber: event.target.value })}
          />
        </label>
        <label htmlFor={fieldId("answer")}>정답</label>
        <textarea
          id={fieldId("answer")}
          className="import-answer-review-answer-input"
          aria-label={`${item.questionNumber}번 정답`}
          value={item.answer}
          rows={2}
          onChange={updateText(onUpdate, item, "answer")}
        />
        <div className="import-answer-review-answer-preview" aria-label={`${item.questionNumber}번 정답 미리보기`}>
          <MathText text={item.answer || "정답 없음"} />
        </div>
        <label className="import-answer-review-difficulty" htmlFor={fieldId("difficulty")}>
          <span>난이도</span>
          <select
            id={fieldId("difficulty")}
            aria-label={`${item.questionNumber || "답안"} 난이도`}
            value={item.difficulty ?? ""}
            onChange={(event) => onUpdate(item.id, { difficulty: event.target.value ? event.target.value as SheetAnswerItem["difficulty"] : undefined })}
          >
            <option value="">난이도 미지정</option>
            <option value="low">쉬움</option>
            <option value="medium">보통</option>
            <option value="high">어려움</option>
          </select>
        </label>
      </div>

      <div className="import-answer-review-details" aria-label={`${item.questionNumber}번 상세 검토 필드`}>
        <ReviewField label="풀이" htmlFor={fieldId("explanation")} defaultOpen={defaultDetailsOpen}>
          <textarea
            id={fieldId("explanation")}
            aria-label={`${item.questionNumber}번 풀이`}
            value={item.explanation}
            rows={4}
            onChange={updateText(onUpdate, item, "explanation")}
          />
        </ReviewField>
        <ReviewField label="풀이 전략" htmlFor={fieldId("strategy")} defaultOpen={defaultDetailsOpen}>
          <textarea
            id={fieldId("strategy")}
            aria-label={`${item.questionNumber}번 풀이 전략`}
            value={item.strategy ?? ""}
            rows={2}
            onChange={updateText(onUpdate, item, "strategy")}
          />
        </ReviewField>
        <ReviewField label="풀이 단계" htmlFor={fieldId("steps")} defaultOpen={defaultDetailsOpen}>
          <textarea
            id={fieldId("steps")}
            aria-label={`${item.questionNumber}번 풀이 단계`}
            value={linesToText(item.steps)}
            rows={3}
            onChange={(event) => onUpdate(item.id, { steps: textToLines(event.target.value) })}
          />
        </ReviewField>
        <ReviewField label="선지 판단" htmlFor={fieldId("judgements")} defaultOpen={defaultDetailsOpen}>
          <textarea
            id={fieldId("judgements")}
            aria-label={`${item.questionNumber}번 선지 판단`}
            value={judgementsToText(item)}
            rows={3}
            onChange={(event) => onUpdate(item.id, { choiceJudgements: textToJudgements(event.target.value) })}
          />
        </ReviewField>
        <ReviewField label="오답 포인트" htmlFor={fieldId("wrong-point")} defaultOpen={defaultDetailsOpen}>
          <textarea
            id={fieldId("wrong-point")}
            aria-label={`${item.questionNumber}번 오답 포인트`}
            value={item.wrongPoint ?? ""}
            rows={2}
            onChange={updateText(onUpdate, item, "wrongPoint")}
          />
        </ReviewField>
        <ReviewField label="복습 포인트" htmlFor={fieldId("review-point")} defaultOpen={defaultDetailsOpen}>
          <textarea
            id={fieldId("review-point")}
            aria-label={`${item.questionNumber}번 복습 포인트`}
            value={item.reviewPoint ?? ""}
            rows={2}
            onChange={updateText(onUpdate, item, "reviewPoint")}
          />
        </ReviewField>
        <ReviewField label="문제별 메모" htmlFor={fieldId("notes")} defaultOpen={defaultDetailsOpen}>
          <textarea
            id={fieldId("notes")}
            aria-label={`${item.questionNumber}번 문제별 메모`}
            value={item.notes ?? ""}
            rows={2}
            onChange={updateText(onUpdate, item, "notes")}
          />
        </ReviewField>
      </div>
    </article>
  );
}

export default function ImportAnswerReviewList({
  items,
  onUpdate,
  onRemove,
  defaultDetailsOpen = false,
}: ImportAnswerReviewListProps) {
  return (
    <section className="import-answer-review-list" aria-label="답안 검수 목록">
      {items.length === 0 ? (
        <p className="import-answer-review-empty">검수할 답안이 없습니다.</p>
      ) : (
        items.map((item) => (
          <AnswerRow
            key={item.id}
            item={item}
            onUpdate={onUpdate}
            onRemove={onRemove}
            defaultDetailsOpen={defaultDetailsOpen}
          />
        ))
      )}
    </section>
  );
}
