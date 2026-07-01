import type { ReactNode } from "react";
import type { ChecklistItem, LearningBlock, MistakeCause, SheetAnswerItem, WrongAnswerEntry } from "../types";
import { mistakeCauseLabel } from "../utils/mistakeAnalysis";
import { LinkifiedText } from "../utils/wikiLinks";
import DiagramCard from "./DiagramCard";
import MathText from "./MathText";

interface LearningContentPanelProps {
  entry: WrongAnswerEntry;
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function answerLabel(item: SheetAnswerItem) {
  return item.questionNumber.trim() ? `${item.questionNumber.trim()}번` : "공통";
}

function Card({
  type,
  title,
  children,
}: {
  type: "concept-card" | "formula-card" | "routine-card" | "warning-card" | "review-card" | "checklist-card";
  title: string;
  children: ReactNode;
}) {
  return (
    <article className={`learning-card ${type}`}>
      <h4>{title}</h4>
      {children}
    </article>
  );
}

function ConceptCard({
  concepts,
  onWikiLinkClick,
}: {
  concepts: string[];
  onWikiLinkClick: (target: string) => void;
}) {
  if (!concepts.length) return null;
  return (
    <Card type="concept-card" title="핵심 개념">
      <div className="learning-chip-list">
        {concepts.map((concept) => (
          <button
            key={concept}
            type="button"
            className="formula-chip"
            onClick={() => onWikiLinkClick(concept)}
          >
            {concept}
          </button>
        ))}
      </div>
    </Card>
  );
}

function StrategyCard({ items }: { items: SheetAnswerItem[] }) {
  const strategies = items.filter((item) => item.strategy?.trim() || item.diagramType || item.diagramSpec);
  if (!strategies.length) return null;
  return (
    <Card type="formula-card" title="공식·풀이 전략">
      <div className="learning-line-list">
        {strategies.map((item) => (
          <div key={`${item.id}-strategy`} className="learning-line-item">
            <span className="formula-chip">{answerLabel(item)}</span>
            {item.strategy?.trim() && <MathText text={item.strategy} />}
            <DiagramCard diagramType={item.diagramType} diagramSpec={item.diagramSpec} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function RoutineCard({
  items,
  onWikiLinkClick,
  existingTargets,
}: {
  items: SheetAnswerItem[];
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
}) {
  const routines = items.filter((item) => item.steps?.length || item.choiceJudgements?.length);
  if (!routines.length) return null;
  return (
    <Card type="routine-card" title="풀이 루틴">
      <div className="learning-routine-list">
        {routines.map((item) => (
          <section key={`${item.id}-routine`}>
            <span className="formula-chip">{answerLabel(item)}</span>
            {(item.steps?.length ?? 0) > 0 && (
              <ol>
                {item.steps?.map((step, index) => (
                  <li key={`${item.id}-step-${index}`}>
                    <LinkifiedText text={step} onLinkClick={onWikiLinkClick} existingTargets={existingTargets} />
                  </li>
                ))}
              </ol>
            )}
            {(item.choiceJudgements?.length ?? 0) > 0 && (
              <ul className="learning-choice-list">
                {item.choiceJudgements?.map((judgement, index) => (
                  <li key={`${item.id}-choice-${index}`}>
                    {judgement.marker && <strong>{judgement.marker}</strong>}
                    <MathText text={judgement.text} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </Card>
  );
}

function WarningCard({ items, causes }: { items: SheetAnswerItem[]; causes: MistakeCause[] }) {
  const wrongPoints = items.filter((item) => item.wrongPoint?.trim() || item.importantPoints.length);
  if (!wrongPoints.length && !causes.length) return null;
  return (
    <Card type="warning-card" title="오답 포인트">
      <div className="learning-line-list">
        {wrongPoints.map((item) => (
          <p key={`${item.id}-wrong`}>
            <span className="formula-chip">{answerLabel(item)}</span>
            <MathText text={item.wrongPoint?.trim() || item.importantPoints.join(" · ")} />
          </p>
        ))}
        {causes.map((cause) => (
          <p key={`${cause.type}-${cause.severity}`}>
            <span className={`learning-severity learning-severity--${cause.severity}`}>
              {cause.severity === "high" ? "높음" : cause.severity === "low" ? "낮음" : "보통"}
            </span>
            <strong>{mistakeCauseLabel(cause.type)}</strong>
            {cause.note && <MathText text={` ${cause.note}`} />}
          </p>
        ))}
      </div>
    </Card>
  );
}

function ReviewCard({ entry, items }: { entry: WrongAnswerEntry; items: SheetAnswerItem[] }) {
  const reviewPoints = items.filter((item) => item.reviewPoint?.trim() || item.needsReview);
  const hasReviewState = Boolean(entry.review?.dueAt || entry.review?.history.length || entry.mastered);
  if (!reviewPoints.length && !hasReviewState) return null;
  return (
    <Card type="review-card" title="다음 복습">
      <div className="learning-line-list">
        {reviewPoints.map((item) => (
          <p key={`${item.id}-review`}>
            <span className="formula-chip">{answerLabel(item)}</span>
            <MathText
              text={
                item.needsReview
                  ? item.reviewPoint?.trim() || "번호와 풀이 연결을 다시 확인"
                  : item.reviewPoint ?? ""
              }
            />
          </p>
        ))}
        {entry.review?.dueAt && (
          <p>
            <span className="formula-chip">복습일</span>
            {new Date(entry.review.dueAt).toLocaleDateString("ko-KR")}
          </p>
        )}
        {entry.mastered && <p className="learning-muted">완료 상태로 표시된 항목입니다.</p>}
      </div>
    </Card>
  );
}

function ChecklistCard({
  memo,
  checklist,
  onWikiLinkClick,
  existingTargets,
}: {
  memo: string;
  checklist: ChecklistItem[];
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
}) {
  if (!memo.trim() && !checklist.length) return null;
  return (
    <Card type="checklist-card" title="전체 메모·확인 목록">
      {memo.trim() && (
        <div className="learning-memo">
          <LinkifiedText text={memo} onLinkClick={onWikiLinkClick} existingTargets={existingTargets} />
        </div>
      )}
      {checklist.length > 0 && (
        <ul className="learning-checklist">
          {checklist.map((item) => (
            <li key={item.id} className={item.checked ? "checked" : ""}>
              <span aria-hidden="true">{item.checked ? "[x]" : "[ ]"}</span>
              <MathText text={item.text} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function cardTypeForBlock(block: LearningBlock): "concept-card" | "formula-card" | "routine-card" | "warning-card" | "review-card" | "checklist-card" {
  if (block.type === "concept") return "concept-card";
  if (block.type === "formula") return "formula-card";
  if (block.type === "routine") return "routine-card";
  if (block.type === "warning") return "warning-card";
  if (block.type === "review") return "review-card";
  return "checklist-card";
}

function LearningBlocksCard({
  blocks,
  onWikiLinkClick,
  existingTargets,
}: {
  blocks: LearningBlock[];
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
}) {
  if (!blocks.length) return null;
  return (
    <>
      {blocks.map((block) => (
        <Card key={block.id} type={cardTypeForBlock(block)} title={block.title || "학습 블록"}>
          {block.sourceQuestionNumber && (
            <span className="formula-chip">{block.sourceQuestionNumber}번</span>
          )}
          {block.content.trim() && (
            <div className="learning-block-content">
              <LinkifiedText
                text={block.content}
                onLinkClick={onWikiLinkClick}
                existingTargets={existingTargets}
              />
            </div>
          )}
          <DiagramCard diagramType={block.diagramType} diagramSpec={block.diagramSpec} />
        </Card>
      ))}
    </>
  );
}

export default function LearningContentPanel({
  entry,
  onWikiLinkClick,
  existingTargets,
}: LearningContentPanelProps) {
  const answerItems = (entry.answerKey ?? []).filter(
    (item) =>
      item.concepts?.length ||
      item.strategy?.trim() ||
      item.steps?.length ||
      item.choiceJudgements?.length ||
      item.wrongPoint?.trim() ||
      item.reviewPoint?.trim() ||
      item.importantPoints.length ||
      item.diagramType ||
      item.diagramSpec ||
      item.needsReview,
  );
  const concepts = unique(answerItems.flatMap((item) => item.concepts ?? []));
  const causes = entry.mistakeAnalysis?.causes ?? [];
  const learningBlocks = entry.learningBlocks ?? [];
  const hasAnyContent =
    concepts.length ||
    answerItems.length ||
    learningBlocks.length ||
    causes.length ||
    entry.memo.trim() ||
    (entry.checklist?.length ?? 0) > 0 ||
    Boolean(entry.review?.dueAt || entry.mastered);

  return (
    <aside className="learning-content-panel" aria-label="학습 내용">
      <header className="learning-content-head">
        <span>학습 내용</span>
        <h3>개념·루틴·주의점</h3>
      </header>
      {hasAnyContent ? (
        <div className="learning-content-grid">
          <ConceptCard concepts={concepts} onWikiLinkClick={onWikiLinkClick} />
          <StrategyCard items={answerItems} />
          <RoutineCard
            items={answerItems}
            onWikiLinkClick={onWikiLinkClick}
            existingTargets={existingTargets}
          />
          <WarningCard items={answerItems} causes={causes} />
          <ReviewCard entry={entry} items={answerItems} />
          <LearningBlocksCard
            blocks={learningBlocks}
            onWikiLinkClick={onWikiLinkClick}
            existingTargets={existingTargets}
          />
          <ChecklistCard
            memo={entry.memo}
            checklist={entry.checklist ?? []}
            onWikiLinkClick={onWikiLinkClick}
            existingTargets={existingTargets}
          />
        </div>
      ) : (
        <div className="learning-content-empty">학습 내용이 아직 없습니다.</div>
      )}
    </aside>
  );
}
