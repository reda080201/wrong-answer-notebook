import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { EntryFormData, QuestionContentSegment } from "../../../types";
import { getEditableContentSegments, hasAmbiguousLegacySourceText, updateDraftContentSegment } from "../model/importWorkspace";
import type { ImportQuestionDraft, ImportWorkspace } from "../model/importWorkspace";
import { commitImportWorkspace } from "../services/commitImportWorkspace";
import { moveQuestion } from "../services/reorderQuestions";
import { renameQuestionNumber } from "../services/renameQuestionNumber";
import { validateImportWorkspace } from "../services/validateImportWorkspace";
import { clearImportWorkspaceDraft, loadImportWorkspaceDraft, saveImportWorkspaceDraft, useImportWorkspaceAutosave } from "../hooks/useImportWorkspaceAutosave";
import { useImportWorkspaceHistory } from "../hooks/useImportWorkspaceHistory";
import Dialog from "../../../shared/ui/Dialog";
import type { TransientWriteRegistration } from "../../../hooks/useAppWriteRegistrations";

interface Props {
  initialWorkspace: ImportWorkspace;
  onSave: (entries: Partial<EntryFormData>[], assetSession?: ImportWorkspace["assetSession"]) => Promise<void> | void;
  onClose: () => void;
  registerDraftFlush: (registration: TransientWriteRegistration) => void;
  validateRecoveryAssets?: (workspace: ImportWorkspace) => Promise<{ valid: boolean; message?: string }>;
  discardWorkspaceAssets?: (workspace: ImportWorkspace) => Promise<void>;
}

function questionText(question: ImportQuestionDraft): string {
  return getEditableContentSegments(question).map((segment) => segment.type === "text" || segment.type === "condition" ? segment.text : segment.type === "equation" ? segment.latex : "").filter(Boolean).join(" ");
}

function segmentLabel(segment: QuestionContentSegment): string {
  if (segment.type === "text") return "본문";
  if (segment.type === "condition") return segment.label ? `조건 · ${segment.label}` : "조건";
  if (segment.type === "equation") return "수식";
  if (segment.type === "figure") return `그림 · ${segment.figureId}`;
  return "표";
}

function segmentValue(segment: QuestionContentSegment): string {
  if (segment.type === "text" || segment.type === "condition") return segment.text;
  if (segment.type === "equation") return segment.latex;
  return "";
}

export default function ImportWorkspaceView({ initialWorkspace, onSave, onClose, registerDraftFlush, validateRecoveryAssets, discardWorkspaceAssets }: Props) {
  const { workspace, setWorkspace, replaceWorkspace, undo, redo, canUndo, canRedo } = useImportWorkspaceHistory(initialWorkspace);
  const [selectedGroupId, setSelectedGroupId] = useState(initialWorkspace.groups[0]?.id ?? "");
  const [selectedQuestionId, setSelectedQuestionId] = useState(initialWorkspace.groups[0]?.questions[0]?.id ?? "");
  const [filter, setFilter] = useState<"all" | "review">("all");
  const [allowWarnings, setAllowWarnings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [closePromptOpen, setClosePromptOpen] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draftSaveState, setDraftSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const [maintenanceBlocked, setMaintenanceBlocked] = useState(false);
  const workspaceRef = useRef(workspace);
  const maintenanceBlockedRef = useRef(false);
  const selectedGroup = workspace.groups.find((group) => group.id === selectedGroupId);
  const questions = selectedGroup?.questions ?? [];
  const selectedQuestion = questions.find((question) => question.id === selectedQuestionId);
  const selectedQuestionIndex = questions.findIndex((question) => question.id === selectedQuestionId);
  const warnings = useMemo(() => validateImportWorkspace(workspace), [workspace]);
  const visibleQuestions = filter === "review" ? questions.filter((question) => question.status !== "ready") : questions;
  const memoryOnlyWithAssets = workspace.assetSession?.mode === "memory-only" && workspace.assetSession.assets.length > 0;
  const selectedContentSegments = selectedQuestion ? getEditableContentSegments(selectedQuestion) : [];

  useLayoutEffect(() => { workspaceRef.current = workspace; }, [workspace]);
  const persistDraft = useCallback(async (snapshot: ImportWorkspace) => {
    setDraftSaveState("saving");
    setDraftSaveError(null);
    try {
      await saveImportWorkspaceDraft(snapshot);
      setDraftSaveState("saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "초안을 저장하지 못했습니다.";
      setDraftSaveState("error");
      setDraftSaveError(message);
      throw new Error(message, { cause: error });
    }
  }, []);
  const updateMaintenanceBlocked = useCallback((blocked: boolean) => {
    maintenanceBlockedRef.current = blocked;
    setMaintenanceBlocked(blocked);
  }, []);
  const rejectMaintenanceMutation = () => {
    if (!maintenanceBlockedRef.current) return false;
    setSaveError("백업 또는 복원 중에는 가져오기 작업실을 변경할 수 없습니다.");
    return true;
  };
  useImportWorkspaceAutosave(workspace, !busy && !recoveryAvailable && !closePromptOpen && !maintenanceBlocked, {
    onSaving: () => setDraftSaveState("saving"),
    onSaved: () => {
      setDraftSaveState("saved");
      setDraftSaveError(null);
    },
    onError: (error) => {
      setDraftSaveState("error");
      setDraftSaveError(error instanceof Error ? error.message : "초안을 저장하지 못했습니다.");
    },
  });
  useEffect(() => {
    registerDraftFlush({
      flush: async () => { await persistDraft(workspaceRef.current); },
      setMaintenanceBlocked: updateMaintenanceBlocked,
    });
    return () => registerDraftFlush(null);
  }, [persistDraft, registerDraftFlush, updateMaintenanceBlocked]);
  useEffect(() => {
    let active = true;
    void loadImportWorkspaceDraft().then((draft) => {
      if (active) setRecoveryAvailable(Boolean(draft));
    }).catch((error) => {
      if (active) setRecoveryError(error instanceof Error ? error.message : "복구 초안을 읽지 못했습니다.");
    });
    return () => { active = false; };
  }, []);

  const requestClose = () => {
    if (busy || recoveryBusy || closeBusy || rejectMaintenanceMutation()) return;
    setCloseError(null);
    setClosePromptOpen(true);
  };

  const preserveAndClose = async () => {
    if (memoryOnlyWithAssets || rejectMaintenanceMutation()) return;
    setCloseBusy(true);
    setCloseError(null);
    try {
      await persistDraft(workspaceRef.current);
      setClosePromptOpen(false);
      onClose();
    } catch (error) {
      setCloseError(error instanceof Error ? error.message : "초안을 저장하지 못했습니다.");
    } finally {
      setCloseBusy(false);
    }
  };

  const discardAndClose = async () => {
    if (rejectMaintenanceMutation()) return;
    setCloseBusy(true);
    setCloseError(null);
    try {
      await discardWorkspaceAssets?.(workspace);
      await clearImportWorkspaceDraft();
      setClosePromptOpen(false);
      onClose();
    } catch (error) {
      setCloseError(error instanceof Error ? error.message : "임시 이미지 자산을 폐기하지 못했습니다.");
    } finally {
      setCloseBusy(false);
    }
  };

  const recoverDraft = async () => {
    if (rejectMaintenanceMutation()) return;
    const recovered = await loadImportWorkspaceDraft();
    if (!recovered) {
      setRecoveryError("복구 초안을 읽지 못했습니다.");
      return;
    }
    setRecoveryBusy(true);
    setRecoveryError(null);
    try {
      const validation = await validateRecoveryAssets?.(recovered);
      if (validation && !validation.valid) {
        setRecoveryError(validation.message ?? "복구 초안의 이미지 자산을 검증하지 못했습니다.");
        return;
      }
      const current = workspaceRef.current;
      const currentSession = current.assetSession;
      const recoveredSession = recovered.assetSession;
      if (currentSession?.mode === "tauri-staged" && currentSession.id !== recoveredSession?.id) {
        await discardWorkspaceAssets?.(current);
      }
      replaceWorkspace(recovered);
      setSelectedGroupId(recovered.groups[0]?.id ?? "");
      setSelectedQuestionId(recovered.groups[0]?.questions[0]?.id ?? "");
      setRecoveryAvailable(false);
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : "복구 초안을 적용하지 못했습니다.");
    } finally {
      setRecoveryBusy(false);
    }
  };

  const discardRecoveryDraft = async () => {
    if (rejectMaintenanceMutation()) return;
    const recovered = await loadImportWorkspaceDraft();
    setRecoveryBusy(true);
    try {
      if (recovered) await discardWorkspaceAssets?.(recovered);
      await clearImportWorkspaceDraft();
      setRecoveryAvailable(false);
      setRecoveryError(null);
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : "복구 초안의 임시 자산을 폐기하지 못했습니다.");
    } finally {
      setRecoveryBusy(false);
    }
  };

  const keepCurrentUpload = async () => {
    await discardRecoveryDraft();
  };

  const updateQuestion = (patch: Partial<ImportQuestionDraft>) => {
    if (rejectMaintenanceMutation()) return;
    setWorkspace((current) => {
    const rename = patch.displayQuestionNumber && selectedQuestion && patch.displayQuestionNumber !== selectedQuestion.displayQuestionNumber;
    return {
      ...current,
      groups: current.groups.map((group) => {
        if (group.id !== selectedGroupId) return group;
        if (rename) return renameQuestionNumber(group, selectedQuestionId, patch.displayQuestionNumber!);
        return {
          ...group,
          questions: group.questions.map((question) => question.id !== selectedQuestionId ? question : {
            ...question, ...patch, confirmed: { ...question.confirmed, content: true },
          }),
        };
      }),
    };
    });
  };

  const updateQuestionSegment = (segmentId: string, value: string) => {
    if (rejectMaintenanceMutation()) return;
    setWorkspace((current) => ({
      ...current,
      groups: current.groups.map((group) => group.id !== selectedGroupId ? group : {
        ...group,
        questions: group.questions.map((question) => {
          if (question.id !== selectedQuestionId) return question;
          return updateDraftContentSegment(question, segmentId, value);
        }),
      }),
    }));
  };

  const moveSelectedQuestion = (targetGroupId: string, targetIndex: number) => {
    if (!selectedQuestion || rejectMaintenanceMutation()) return;
    setWorkspace((current) => ({ ...current, groups: moveQuestion(current.groups, selectedQuestion.id, targetGroupId, targetIndex) }));
    setSelectedGroupId(targetGroupId);
  };

  const save = async () => {
    if (rejectMaintenanceMutation()) return;
    setBusy(true);
    setSaveError(null);
    try {
      const result = commitImportWorkspace(workspace, { allowWarnings });
      await onSave(result.entries, workspace.assetSession);
      clearImportWorkspaceDraft();
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "작업실을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally { setBusy(false); }
  };

  return <Dialog open onClose={requestClose} className="import-workspace" backdropClassName="modal-backdrop import-workspace-backdrop" ariaLabel="가져오기 작업실" closeDisabled={busy || recoveryBusy || closeBusy || maintenanceBlocked} busy={busy || recoveryBusy || closeBusy}>
    <header className="modal-header"><div><p className="modal-eyebrow">가져오기 작업실</p><h2>자료를 검토한 뒤 저장하세요</h2><p>자동 분석 결과는 제안으로만 사용되며, 저장 전 수정할 수 있습니다.</p></div><div className="import-workspace-header-actions"><button type="button" className="btn-secondary" onClick={undo} disabled={!canUndo || busy || recoveryBusy || maintenanceBlocked}>되돌리기</button><button type="button" className="btn-secondary" onClick={redo} disabled={!canRedo || busy || recoveryBusy || maintenanceBlocked}>다시 실행</button><button type="button" className="btn-icon" onClick={requestClose} aria-label="작업실 닫기" disabled={busy || recoveryBusy || closeBusy || maintenanceBlocked}>✕</button></div></header>
    {maintenanceBlocked && <p className="form-hint" role="status">백업 또는 복원 중에는 작업실이 읽기 전용입니다.</p>}
    {recoveryAvailable && <div className="import-workspace-recovery" role="status">이전에 저장된 가져오기 초안이 있습니다. 자산 검증 후 저장된 초안을 열 수 있습니다. {recoveryError && <p className="form-error">{recoveryError}</p>}<button type="button" onClick={() => void recoverDraft()} disabled={recoveryBusy || maintenanceBlocked}>저장 초안 열기</button><button type="button" onClick={() => void keepCurrentUpload()} disabled={recoveryBusy || maintenanceBlocked}>현재 업로드 유지</button><button type="button" onClick={() => void discardRecoveryDraft()} disabled={recoveryBusy || maintenanceBlocked}>복구 초안 삭제</button></div>}
    <div className="import-workspace-grid"><aside className="import-workspace-sidebar"><h3>자료 및 회차</h3>{workspace.groups.map((group) => <button type="button" key={group.id} className={group.id === selectedGroupId ? "is-selected" : ""} onClick={() => { setSelectedGroupId(group.id); setSelectedQuestionId(group.questions[0]?.id ?? ""); }}>{group.title}<small>{group.questions.length}문항 · 신뢰도 {Math.round((group.confidence ?? 0) * 100)}%</small></button>)}{workspace.unassignedBlocks.length > 0 && <p className="form-error">미분류 블록 {workspace.unassignedBlocks.length}개</p>}</aside>
      <main className="import-workspace-list"><header><strong>{selectedGroup?.title ?? "문항"}</strong><div><button type="button" className={filter === "all" ? "is-selected" : ""} onClick={() => setFilter("all")}>전체</button><button type="button" className={filter === "review" ? "is-selected" : ""} onClick={() => setFilter("review")}>검토 필요</button></div></header>{visibleQuestions.map((question) => <article key={question.id} className={question.id === selectedQuestionId ? "is-selected" : ""} onClick={() => setSelectedQuestionId(question.id)}><div><strong>{question.displayQuestionNumber}번</strong><p>{questionText(question).slice(0, 150)}</p><small>{question.status === "ready" ? "준비됨" : question.warnings[0] ?? "검토 필요"}</small></div></article>)}</main>
      <aside className="import-workspace-editor"><h3>문항 편집</h3>{selectedQuestion ? <><label>현재 문항 번호<input disabled={maintenanceBlocked} value={selectedQuestion.displayQuestionNumber} onChange={(event) => updateQuestion({ displayQuestionNumber: event.target.value })} /></label><label>원본 문항 번호<input disabled={maintenanceBlocked} value={selectedQuestion.sourceQuestionNumber ?? ""} onChange={(event) => updateQuestion({ sourceQuestionNumber: event.target.value })} /></label>{hasAmbiguousLegacySourceText(selectedQuestion) && <p className="form-error" role="alert">기존 본문이 여러 text segment로 나뉘어 있어 자동 병합할 수 없습니다. 각 본문 segment를 확인한 뒤 저장하세요.</p>}<h4>문항 내용</h4>{selectedContentSegments.map((segment) => segment.type === "figure" || segment.type === "table" ? <div className="import-workspace-segment-anchor" key={segment.id} role="note"><strong>{segmentLabel(segment)}</strong><span>문항 내 배치를 유지합니다.</span>{segment.type === "table" && <pre>{segment.rows.map((row) => row.join(" | ")).join("\n")}</pre>}</div> : <label key={segment.id}>{segmentLabel(segment)}<textarea disabled={maintenanceBlocked} value={segmentValue(segment)} onChange={(event) => updateQuestionSegment(segment.id, event.target.value)} /></label>)}<h4>선택지</h4>{selectedQuestion.choices.map((choice, index) => <label key={choice.id}>{choice.marker || `선지 ${index + 1}`}<input disabled={maintenanceBlocked} value={choice.content} onChange={(event) => updateQuestion({ choices: selectedQuestion.choices.map((item) => item.id === choice.id ? { ...item, content: event.target.value } : item) })} /></label>)}<p className="import-workspace-note">그림 {selectedQuestion.figures.length}개 · 원본 페이지 {selectedQuestion.sourcePageAssets.length}개</p><div className="import-workspace-move"><label>회차 이동<select disabled={maintenanceBlocked} value={selectedGroupId} onChange={(event) => moveSelectedQuestion(event.target.value, 0)}>{workspace.groups.map((group) => <option key={group.id} value={group.id}>{group.title}</option>)}</select></label><button type="button" onClick={() => moveSelectedQuestion(selectedGroupId, selectedQuestionIndex - 1)} disabled={maintenanceBlocked || selectedQuestionIndex <= 0}>위로</button><button type="button" onClick={() => moveSelectedQuestion(selectedGroupId, selectedQuestionIndex + 1)} disabled={maintenanceBlocked || selectedQuestionIndex < 0 || selectedQuestionIndex >= questions.length - 1}>아래로</button></div></> : <p>문항을 선택하세요.</p>}</aside>
    </div><footer className="import-workspace-footer"><span>{workspace.groups.reduce((sum, group) => sum + group.questions.length, 0)}문항 · 경고 {warnings.length}개</span><span role="status">{draftSaveState === "saving" ? "초안 저장 중…" : draftSaveState === "saved" ? "초안 저장됨" : draftSaveState === "error" ? "초안 저장 실패" : ""}</span><label><input type="checkbox" checked={allowWarnings} onChange={(event) => setAllowWarnings(event.target.checked)} disabled={busy || recoveryBusy || maintenanceBlocked} /> 경고가 있는 회차도 저장</label><button type="button" className="btn-secondary" onClick={requestClose} disabled={busy || recoveryBusy || maintenanceBlocked}>닫기</button><button type="button" disabled={busy || recoveryBusy || maintenanceBlocked} onClick={() => void save()}>{busy ? "저장 중…" : "검토 결과 저장"}</button></footer>
    {saveError && <p className="form-error" role="alert">{saveError}<button type="button" className="btn-secondary" onClick={() => void save()} disabled={busy}>다시 저장</button></p>}
    {draftSaveError && <p className="form-error" role="alert">{draftSaveError}<button type="button" className="btn-secondary" onClick={() => { try { persistDraft(workspaceRef.current); } catch { /* state is already updated */ } }} disabled={draftSaveState === "saving"}>초안 다시 저장</button></p>}
    <Dialog open={closePromptOpen} onClose={() => setClosePromptOpen(false)} title="가져오기 작업실을 닫을까요?" closeDisabled={closeBusy} busy={closeBusy}>
      <p>현재 초안과 staged 이미지 자산을 어떻게 처리할지 선택하세요.</p>
      {closeError && <p className="form-error" role="alert">{closeError}</p>}
      {memoryOnlyWithAssets && <p className="form-hint">이미지 파일은 현재 작업실을 닫는 즉시 사라지므로 계속 편집하거나 초안·이미지를 폐기해야 합니다.</p>}
      <footer className="dialog-actions"><button type="button" className="btn-secondary" onClick={() => setClosePromptOpen(false)} disabled={closeBusy}>계속 편집</button><button type="button" className="btn-secondary" onClick={() => void preserveAndClose()} disabled={closeBusy || memoryOnlyWithAssets}>초안 보존하고 닫기</button><button type="button" className="btn-danger" onClick={() => void discardAndClose()} disabled={closeBusy}>{closeBusy ? "폐기 중…" : "초안·이미지 폐기"}</button></footer>
    </Dialog>
  </Dialog>;
}
