import { useEffect, useMemo, useState } from "react";
import type { EntryFormData } from "../../../types";
import type { ImportQuestionDraft, ImportWorkspace } from "../model/importWorkspace";
import { commitImportWorkspace } from "../services/commitImportWorkspace";
import { moveQuestion } from "../services/reorderQuestions";
import { validateImportWorkspace } from "../services/validateImportWorkspace";
import { clearImportWorkspaceDraft, loadImportWorkspaceDraft, useImportWorkspaceAutosave } from "../hooks/useImportWorkspaceAutosave";
import { useImportWorkspaceHistory } from "../hooks/useImportWorkspaceHistory";
import Dialog from "../../../shared/ui/Dialog";

interface Props { initialWorkspace: ImportWorkspace; onSave: (entries: Partial<EntryFormData>[]) => Promise<void> | void; onClose: () => void; }

function questionText(question: ImportQuestionDraft): string {
  return question.sourceText ?? question.contentSegments.map((segment) => segment.type === "text" || segment.type === "condition" ? segment.text : segment.type === "equation" ? segment.latex : "").filter(Boolean).join(" ");
}

export default function ImportWorkspaceView({ initialWorkspace, onSave, onClose }: Props) {
  const { workspace, setWorkspace, undo, redo, canUndo, canRedo } = useImportWorkspaceHistory(initialWorkspace);
  const [selectedGroupId, setSelectedGroupId] = useState(initialWorkspace.groups[0]?.id ?? "");
  const [selectedQuestionId, setSelectedQuestionId] = useState(initialWorkspace.groups[0]?.questions[0]?.id ?? "");
  const [filter, setFilter] = useState<"all" | "review">("all");
  const [allowWarnings, setAllowWarnings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const selectedGroup = workspace.groups.find((group) => group.id === selectedGroupId);
  const questions = selectedGroup?.questions ?? [];
  const selectedQuestion = questions.find((question) => question.id === selectedQuestionId);
  const selectedQuestionIndex = questions.findIndex((question) => question.id === selectedQuestionId);
  const warnings = useMemo(() => validateImportWorkspace(workspace), [workspace]);
  const visibleQuestions = filter === "review" ? questions.filter((question) => question.status !== "ready") : questions;

  useImportWorkspaceAutosave(workspace, !busy);
  useEffect(() => { setRecoveryAvailable(Boolean(loadImportWorkspaceDraft())); }, []);

  const updateQuestion = (patch: Partial<ImportQuestionDraft>) => setWorkspace((current) => ({
    ...current,
    groups: current.groups.map((group) => group.id !== selectedGroupId ? group : {
      ...group,
      questions: group.questions.map((question) => question.id !== selectedQuestionId ? question : {
        ...question, ...patch, confirmed: { ...question.confirmed, content: true },
      }),
    }),
  }));

  const moveSelectedQuestion = (targetGroupId: string, targetIndex: number) => {
    if (!selectedQuestion) return;
    setWorkspace((current) => ({ ...current, groups: moveQuestion(current.groups, selectedQuestion.id, targetGroupId, targetIndex) }));
    setSelectedGroupId(targetGroupId);
  };

  const save = async () => {
    setBusy(true);
    try {
      const result = commitImportWorkspace(workspace, { allowWarnings });
      await onSave(result.entries);
      clearImportWorkspaceDraft();
      onClose();
    } finally { setBusy(false); }
  };

  return <Dialog open onClose={onClose} className="import-workspace" backdropClassName="modal-backdrop import-workspace-backdrop" ariaLabel="가져오기 작업실" closeDisabled={busy} busy={busy}>
    <header className="modal-header"><div><p className="modal-eyebrow">가져오기 작업실</p><h2>자료를 검토한 뒤 저장하세요</h2><p>자동 분석 결과는 제안으로만 사용되며, 저장 전 수정할 수 있습니다.</p></div><div className="import-workspace-header-actions"><button type="button" className="btn-secondary" onClick={undo} disabled={!canUndo || busy}>되돌리기</button><button type="button" className="btn-secondary" onClick={redo} disabled={!canRedo || busy}>다시 실행</button><button type="button" className="btn-icon" onClick={onClose} aria-label="작업실 닫기">✕</button></div></header>
    {recoveryAvailable && <div className="import-workspace-recovery" role="status">이전에 작업하던 가져오기 초안이 있습니다. <button type="button" onClick={() => setRecoveryAvailable(false)}>현재 초안 계속하기</button><button type="button" onClick={() => { clearImportWorkspaceDraft(); setRecoveryAvailable(false); }}>복구 초안 삭제</button></div>}
    <div className="import-workspace-grid"><aside className="import-workspace-sidebar"><h3>자료 및 회차</h3>{workspace.groups.map((group) => <button type="button" key={group.id} className={group.id === selectedGroupId ? "is-selected" : ""} onClick={() => { setSelectedGroupId(group.id); setSelectedQuestionId(group.questions[0]?.id ?? ""); }}>{group.title}<small>{group.questions.length}문항 · 신뢰도 {Math.round((group.confidence ?? 0) * 100)}%</small></button>)}{workspace.unassignedBlocks.length > 0 && <p className="form-error">미분류 블록 {workspace.unassignedBlocks.length}개</p>}</aside>
      <main className="import-workspace-list"><header><strong>{selectedGroup?.title ?? "문항"}</strong><div><button type="button" className={filter === "all" ? "is-selected" : ""} onClick={() => setFilter("all")}>전체</button><button type="button" className={filter === "review" ? "is-selected" : ""} onClick={() => setFilter("review")}>검토 필요</button></div></header>{visibleQuestions.map((question) => <article key={question.id} className={question.id === selectedQuestionId ? "is-selected" : ""} onClick={() => setSelectedQuestionId(question.id)}><span className="drag-handle" aria-label={`${question.displayQuestionNumber}번 문항 이동`} tabIndex={0}>≡</span><div><strong>{question.displayQuestionNumber}번</strong><p>{questionText(question).slice(0, 150)}</p><small>{question.status === "ready" ? "준비됨" : question.warnings[0] ?? "검토 필요"}</small></div></article>)}</main>
      <aside className="import-workspace-editor"><h3>문항 편집</h3>{selectedQuestion ? <><label>현재 문항 번호<input value={selectedQuestion.displayQuestionNumber} onChange={(event) => updateQuestion({ displayQuestionNumber: event.target.value })} /></label><label>원본 문항 번호<input value={selectedQuestion.sourceQuestionNumber ?? ""} onChange={(event) => updateQuestion({ sourceQuestionNumber: event.target.value })} /></label><label>본문<textarea value={questionText(selectedQuestion)} onChange={(event) => updateQuestion({ sourceText: event.target.value, status: "needs_review" })} /></label><h4>선택지</h4>{selectedQuestion.choices.map((choice, index) => <label key={choice.id}>{choice.marker || `선지 ${index + 1}`}<input value={choice.content} onChange={(event) => updateQuestion({ choices: selectedQuestion.choices.map((item) => item.id === choice.id ? { ...item, content: event.target.value } : item) })} /></label>)}<p className="import-workspace-note">그림 {selectedQuestion.figures.length}개 · 원본 페이지 {selectedQuestion.sourcePageAssets.length}개</p><div className="import-workspace-move"><label>회차 이동<select value={selectedGroupId} onChange={(event) => moveSelectedQuestion(event.target.value, 0)}>{workspace.groups.map((group) => <option key={group.id} value={group.id}>{group.title}</option>)}</select></label><button type="button" onClick={() => moveSelectedQuestion(selectedGroupId, selectedQuestionIndex - 1)} disabled={selectedQuestionIndex <= 0}>위로</button><button type="button" onClick={() => moveSelectedQuestion(selectedGroupId, selectedQuestionIndex + 1)} disabled={selectedQuestionIndex < 0 || selectedQuestionIndex >= questions.length - 1}>아래로</button></div></> : <p>문항을 선택하세요.</p>}</aside>
    </div><footer className="import-workspace-footer"><span>{workspace.groups.reduce((sum, group) => sum + group.questions.length, 0)}문항 · 경고 {warnings.length}개</span><label><input type="checkbox" checked={allowWarnings} onChange={(event) => setAllowWarnings(event.target.checked)} /> 경고가 있는 회차도 저장</label><button type="button" className="btn-secondary" onClick={onClose}>닫기</button><button type="button" disabled={busy} onClick={() => void save()}>{busy ? "저장 중…" : "검토 결과 저장"}</button></footer>
  </Dialog>;
}
