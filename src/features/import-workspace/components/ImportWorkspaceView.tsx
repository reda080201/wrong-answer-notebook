import AssessmentCard from "../../import/vision/AssessmentCard";
import { normalizeQuestionNumber } from "../../../utils/questionNumber";
import { isAnswerReadyForGrading } from "../../../utils/studyAssessment";
import { VisionImportBridge } from "../../import/vision/VisionImportBridge";
import FigureReviewCard from "../../figures/components/FigureReviewCard";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import HotspotLinkEditor from "../../solutions/HotspotLinkEditor";
import { entrySolutionQuestions } from "../../solutions/solutionModel";
import { questionDraftToEntryData } from "../model/importWorkspace";
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
import WorkspaceQuestionPreview from "./WorkspaceQuestionPreview";
import MathText from "../../../components/MathText";
import type { TransientWriteRegistration } from "../../../hooks/useAppWriteRegistrations";

interface Props {
  initialWorkspace: ImportWorkspace;
  visionOriginalFiles?: File[];
  resolvePageUrl?(filename: string, session?: ImportWorkspace["assetSession"]): Promise<string>;
  onSave: (entries: Partial<EntryFormData>[], assetSession?: ImportWorkspace["assetSession"], plannedIds?: string[]) => Promise<string[] | void> | void;
  onClose: () => void;
  registerDraftFlush: (registration: TransientWriteRegistration) => void;
  validateRecoveryAssets?: (workspace: ImportWorkspace) => Promise<{ valid: boolean; message?: string }>;
  discardWorkspaceAssets?: (workspace: ImportWorkspace) => Promise<void>;
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

export default function ImportWorkspaceView({ initialWorkspace, visionOriginalFiles, resolvePageUrl, onSave, onClose, registerDraftFlush, validateRecoveryAssets, discardWorkspaceAssets }: Props) {
  const { workspace, setWorkspace, replaceWorkspace, undo, redo, canUndo, canRedo } = useImportWorkspaceHistory(initialWorkspace);
  const [selectedGroupId, setSelectedGroupId] = useState(initialWorkspace.groups[0]?.id ?? "");
  const [selectedQuestionId, setSelectedQuestionId] = useState(initialWorkspace.groups[0]?.questions[0]?.id ?? "");
  const [filter, setFilter] = useState<"all" | "review">("all");
  const [hotspotEditorOpen, setHotspotEditorOpen] = useState(false);
  const recoveryPendingRef = useRef(true);
  const actionBusyRef = useRef(false);
  const [recoveryChecking, setRecoveryChecking] = useState(true);
  const [commitUncertain, setCommitUncertain] = useState(Boolean(initialWorkspace.commitAttempt));
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
  const [committedAwaitingDraftCleanup, setCommittedAwaitingDraftCleanup] = useState(false);
  const committedAwaitingDraftCleanupRef = useRef(false);
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
  const loadPageUrl = useCallback((filename: string) => { if (!resolvePageUrl) return Promise.reject(new Error("원본 이미지 미리보기를 사용할 수 없습니다.")); return resolvePageUrl(filename, workspace.assetSession); }, [resolvePageUrl, workspace.assetSession]);
  const selectedMeta = selectedGroup?.entryMetadata?.questionMeta?.filter(meta => normalizeQuestionNumber(meta.questionNumber) === normalizeQuestionNumber(selectedQuestion?.displayQuestionNumber ?? ""));
  const selectedIssues = warnings.filter(warning => warning.questionId === selectedQuestionId);
  const cannotConfirmReview = selectedIssues.some(warning => warning.severity === "error") || Boolean(selectedQuestion?.answer && !isAnswerReadyForGrading(selectedQuestion.answer as import("../../../types").SheetAnswerItem)) || Boolean(selectedQuestion?.figures.some(figure => figure.needsReview || figure.processingStatus === "rejected"));
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
    if (!maintenanceBlockedRef.current && !workspaceRef.current.commitAttempt && !actionBusyRef.current && !recoveryPendingRef.current) return false;
    setSaveError(workspaceRef.current.commitAttempt ? "확정 저장 기록이 남아 있습니다. 저장 결과 확인 또는 초안 정리만 실행할 수 있습니다." : recoveryPendingRef.current ? "기존 초안을 확인한 뒤 현재 자료를 편집할 수 있습니다." : "진행 중인 저장·백업·복원이 끝난 뒤 다시 시도해 주세요.");
    return true;
  };
  const cancelAutosaveAndDrain = useImportWorkspaceAutosave(workspace, !busy && !recoveryAvailable && !recoveryChecking && !closePromptOpen && !maintenanceBlocked && !workspace.commitAttempt && !committedAwaitingDraftCleanup, {
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
      flush: async () => { await cancelAutosaveAndDrain(); if (!workspaceRef.current.commitAttempt && !recoveryPendingRef.current) await persistDraft(workspaceRef.current); },
      setMaintenanceBlocked: updateMaintenanceBlocked,
    });
    return () => registerDraftFlush(null);
  }, [cancelAutosaveAndDrain, persistDraft, registerDraftFlush, updateMaintenanceBlocked]);


  const retryDraftSave = async () => {
    if (rejectMaintenanceMutation()) return;
    actionBusyRef.current = true;
    setBusy(true);
    try {
      await cancelAutosaveAndDrain();
      await persistDraft(workspaceRef.current);
    } catch { /* persistDraft exposes the failure and retry in the workspace. */ }
    finally { actionBusyRef.current = false; setBusy(false); }
  };

  const requestClose = () => {
    if (busy || recoveryBusy || closeBusy || maintenanceBlockedRef.current || actionBusyRef.current) return;
    if (workspaceRef.current.commitAttempt) { onClose(); return; }
    setCloseError(null);
    setClosePromptOpen(true);
  };

  const preserveAndClose = async () => {
    if (memoryOnlyWithAssets || rejectMaintenanceMutation()) return;
    actionBusyRef.current = true;
    setCloseBusy(true);
    setCloseError(null);
    try {
      await cancelAutosaveAndDrain();
      await persistDraft(workspaceRef.current);
      setClosePromptOpen(false);
      onClose();
    } catch (error) {
      setCloseError(error instanceof Error ? error.message : "초안을 저장하지 못했습니다.");
    } finally {
      actionBusyRef.current = false;
      setCloseBusy(false);
    }
  };

  const discardAndClose = async () => {
    if (rejectMaintenanceMutation()) return;
    actionBusyRef.current = true;
    setCloseBusy(true);
    setCloseError(null);
    try {
      await cancelAutosaveAndDrain();
      await discardWorkspaceAssets?.(workspace);
      await clearImportWorkspaceDraft();
      setClosePromptOpen(false);
      onClose();
    } catch (error) {
      setCloseError(error instanceof Error ? error.message : "임시 이미지 자산을 폐기하지 못했습니다.");
    } finally {
      actionBusyRef.current = false;
      setCloseBusy(false);
    }
  };

  const recoverDraft = async () => {
    if (maintenanceBlockedRef.current || actionBusyRef.current) return;
    actionBusyRef.current = true;
    setRecoveryBusy(true);
    setRecoveryError(null);
    try {
      const recovered = await loadImportWorkspaceDraft();
      if (!recovered) throw new Error("복구 초안을 읽지 못했습니다.");
      if (recovered.commitAttempt) {
        workspaceRef.current = recovered;
        replaceWorkspace(recovered);
        setSelectedGroupId(recovered.groups[0]?.id ?? "");
        setSelectedQuestionId(recovered.groups[0]?.questions[0]?.id ?? "");
        recoveryPendingRef.current = false;
        setRecoveryAvailable(false);
        await resolveCommit(recovered);
        return;
      }
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
      recoveryPendingRef.current = false;
      setRecoveryAvailable(false);
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : "복구 초안을 적용하지 못했습니다.");
    } finally {
      actionBusyRef.current = false;
      setRecoveryBusy(false);
    }
  };

  const discardRecoveryDraft = async () => {
    if (maintenanceBlockedRef.current || actionBusyRef.current) return;
    actionBusyRef.current = true;
    setRecoveryBusy(true);
    try {
      const recovered = await loadImportWorkspaceDraft();
      if (recovered?.commitAttempt) {
        workspaceRef.current = recovered; replaceWorkspace(recovered); setSelectedGroupId(recovered.groups[0]?.id ?? ""); setSelectedQuestionId(recovered.groups[0]?.questions[0]?.id ?? ""); recoveryPendingRef.current = false; setRecoveryAvailable(false);
        await resolveCommit(recovered);
        return;
      }
      await cancelAutosaveAndDrain();
      if (recovered) await discardWorkspaceAssets?.(recovered);
      await clearImportWorkspaceDraft();
      recoveryPendingRef.current = false;
      setRecoveryAvailable(false);
      setRecoveryError(null);
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : "복구 초안의 임시 자산을 폐기하지 못했습니다.");
    } finally {
      actionBusyRef.current = false;
      setRecoveryBusy(false);
    }
  };

  const keepCurrentUpload = async () => {
    await discardRecoveryDraft();
  };

  const resolveFigureUrl = useCallback((filename: string) => resolvePageUrl ? resolvePageUrl(filename, workspace.assetSession) : Promise.reject(new Error("임시 이미지 경로를 확인할 수 없습니다.")), [resolvePageUrl, workspace.assetSession]);

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
          ...(patch.needsReview === false ? { entryMetadata: { ...group.entryMetadata, questionMeta: group.entryMetadata?.questionMeta?.map(meta => normalizeQuestionNumber(meta.questionNumber) === normalizeQuestionNumber(selectedQuestion?.displayQuestionNumber ?? "") ? { ...meta, needsReview: false } : meta) } } : {}),
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

  const resolveCommit = async (snapshot: ImportWorkspace): Promise<boolean> => {
    const latestDraft = await loadImportWorkspaceDraft();
    if (latestDraft?.id === snapshot.id) snapshot = latestDraft;
    const attempt = snapshot.commitAttempt;
    if (!attempt || !attempt.entryIds.length) throw new Error("확정 저장 기록이 올바르지 않습니다.");
    if (!attempt.attemptId) throw new Error("이전 확정 기록의 저장 내용을 입증할 수 없습니다. 항목 목록과 백업을 확인해 주세요.");
    const ids = await onSave(attempt.preparedEntries ?? commitImportWorkspace(snapshot).entries, snapshot.assetSession, attempt.entryIds);
    if (JSON.stringify(ids) === JSON.stringify(attempt.entryIds)) {
      committedAwaitingDraftCleanupRef.current = true;
      setCommittedAwaitingDraftCleanup(true);
      setCommitUncertain(false);
      return true;
    }
    setCommitUncertain(true);
    throw new Error("이전 가져오기 저장 결과를 모두 확인할 수 없습니다. 항목 목록과 백업을 확인하세요. 중복 생성을 막기 위해 재가져오기를 중단했습니다.");
  };

  useEffect(() => {
    let active = true;
    void loadImportWorkspaceDraft().then((draft) => {
      if (active) { recoveryPendingRef.current = Boolean(draft); setRecoveryAvailable(Boolean(draft)); if (draft?.id === initialWorkspace.id) void recoverDraft(); }
    }).catch((error) => {
      if (active) { setRecoveryAvailable(true); setRecoveryError(error instanceof Error ? error.message : "복구 초안을 읽지 못했습니다."); }
    }).finally(() => { if (active) setRecoveryChecking(false); });
    return () => { active = false; };
  }, []);

  const save = async () => {
    if (maintenanceBlockedRef.current || actionBusyRef.current || recoveryAvailable || recoveryChecking) return;
    actionBusyRef.current = true;
    setBusy(true);
    setSaveError(null);
    try {
      await cancelAutosaveAndDrain();
      let snapshot = workspaceRef.current;
      if (snapshot.commitAttempt) {
        await resolveCommit(snapshot);
      } else {
        const result = commitImportWorkspace(snapshot);
        const groupIds = snapshot.groups.filter(group => group.questions.length).map(group => group.id);
        const attempt = { entryIds: result.entries.map(() => crypto.randomUUID()), groupIds, state: "pending" as const, attemptId: crypto.randomUUID(), createdAt: new Date().toISOString() };
        snapshot = { ...snapshot, commitAttempt: attempt };
        // The durable receipt must exist before any entry or asset is committed.
        await persistDraft(snapshot);
        workspaceRef.current = snapshot;
        replaceWorkspace(snapshot);
        setCommitUncertain(true);
        const ids = await onSave(result.entries, snapshot.assetSession, attempt.entryIds);
        if (JSON.stringify(ids) !== JSON.stringify(attempt.entryIds)) throw new Error("실제 저장된 항목 ID를 모두 확인하지 못했습니다.");
      }
      snapshot = await loadImportWorkspaceDraft() ?? snapshot;
      committedAwaitingDraftCleanupRef.current = true;
      setCommittedAwaitingDraftCleanup(true);
      setCommitUncertain(false);
      snapshot = { ...snapshot, commitAttempt: { ...snapshot.commitAttempt!, state: "completed" } };
      workspaceRef.current = snapshot;
      replaceWorkspace(snapshot);
      await persistDraft(snapshot);
      await clearImportWorkspaceDraft();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "작업실을 저장하지 못했습니다.";
      setSaveError(committedAwaitingDraftCleanupRef.current ? `항목은 저장됐지만 초안을 정리하지 못했습니다. ${message}` : message);
    } finally {
      actionBusyRef.current = false;
      setBusy(false);
    }
  };

  return <Dialog open onClose={requestClose} returnFocusFallback={() => document.querySelector<HTMLButtonElement>("[data-import-launcher]")} className="import-workspace" backdropClassName="modal-backdrop import-workspace-backdrop" ariaLabel="가져오기 작업실" closeDisabled={busy || recoveryBusy || closeBusy || maintenanceBlocked} busy={busy || recoveryBusy || closeBusy}>
    {hotspotEditorOpen && selectedGroup && (() => { const data = questionDraftToEntryData(selectedGroup); return <HotspotLinkEditor loadPageUrl={resolvePageUrl ? loadPageUrl : undefined} pages={data.sourcePageImages ?? []} questions={entrySolutionQuestions({ question: data.question ?? "", structuredQuestions: data.structuredQuestions, questionContentSegments: data.questionContentSegments, answerKey: data.answerKey, figures: data.figures })} hotspots={selectedGroup.entryMetadata?.questionSolutionHotspots ?? []} initialCandidates={selectedGroup.solutionHotspotCandidates} onCandidatesChange={candidates => { if (rejectMaintenanceMutation()) return; setWorkspace(current => ({ ...current, groups: current.groups.map(group => group.id === selectedGroupId ? { ...group, solutionHotspotCandidates: candidates } : group) })); }} onSave={hotspots => { if (rejectMaintenanceMutation()) throw new Error("현재 가져오기 작업을 변경할 수 없습니다."); setWorkspace(current => ({ ...current, groups: current.groups.map(group => group.id === selectedGroupId ? { ...group, entryMetadata: { ...group.entryMetadata, questionSolutionHotspots: hotspots } } : group) })); }} onClose={() => setHotspotEditorOpen(false)} />; })()}
    <header className="modal-header"><div><p className="modal-eyebrow">가져오기 작업실</p><h2>자료를 검토한 뒤 저장하세요</h2><p>자동 분석 결과는 제안으로만 사용되며, 저장 전 수정할 수 있습니다.</p></div><div className="import-workspace-header-actions"><button type="button" className="btn-secondary" onClick={undo} disabled={Boolean(workspace.commitAttempt) || !canUndo || busy || recoveryBusy || maintenanceBlocked}>되돌리기</button><button type="button" className="btn-secondary" onClick={redo} disabled={Boolean(workspace.commitAttempt) || !canRedo || busy || recoveryBusy || maintenanceBlocked}>다시 실행</button><button type="button" className="btn-icon" onClick={requestClose} aria-label="작업실 닫기" disabled={busy || recoveryBusy || closeBusy || maintenanceBlocked}>✕</button></div></header>
    {maintenanceBlocked && <p className="form-hint" role="status">백업 또는 복원 중에는 작업실이 읽기 전용입니다.</p>}
    {recoveryAvailable && <div className="import-workspace-recovery" role="status">{recoveryError ? "이전 초안을 확인하지 못했습니다. 다시 불러오거나 확인 후 폐기하세요." : "이전에 저장된 가져오기 초안이 있습니다. 자산 검증 후 저장된 초안을 열 수 있습니다."} {recoveryError && <p className="form-error">{recoveryError}</p>}<button type="button" onClick={() => void recoverDraft()} disabled={recoveryBusy || maintenanceBlocked}>저장 초안 열기</button><button type="button" onClick={() => void keepCurrentUpload()} disabled={recoveryBusy || maintenanceBlocked}>현재 업로드 유지</button><button type="button" onClick={() => void discardRecoveryDraft()} disabled={recoveryBusy || maintenanceBlocked}>복구 초안 삭제</button></div>}
    {!recoveryAvailable && recoveryError && <p className="form-error" role="alert">{recoveryError}</p>}
    {workspace.visionJob && !workspace.commitAttempt && <VisionImportBridge key={workspace.visionJob.id} initialAnalysis={workspace.visionJob.analysisText} initialFiles={visionOriginalFiles} expectedSources={workspace.visionJob.sourceFiles} autoOpen={false} initialDraftText={workspace.visionJob.draftAnalysisText} disabled={maintenanceBlocked || busy || recoveryBusy} onDraftChange={text => { if (maintenanceBlocked || workspace.commitAttempt) return; setWorkspace(current => current.visionJob ? { ...current, visionJob: { ...current.visionJob, draftAnalysisText: text } } : current); }} />}
    <div className="import-workspace-grid" inert={Boolean(workspace.commitAttempt) || busy || recoveryBusy || recoveryAvailable || recoveryChecking || maintenanceBlocked}><aside className="import-workspace-sidebar"><label className="workspace-group-picker">자료 및 회차<select value={selectedGroupId} onChange={event => { const group = workspace.groups.find(item => item.id === event.target.value); setSelectedGroupId(event.target.value); setSelectedQuestionId(group?.questions[0]?.id ?? ""); }}>{workspace.groups.map(group => <option key={group.id} value={group.id}>{group.title}</option>)}</select></label><h3>자료 및 회차</h3>{workspace.groups.map((group) => <button type="button" key={group.id} className={group.id === selectedGroupId ? "is-selected" : ""} onClick={() => { setSelectedGroupId(group.id); setSelectedQuestionId(group.questions[0]?.id ?? ""); }}>{group.title}<small>{group.questions.length}문항 · 검토 필요 {group.questions.filter(question => question.status !== "ready").length}문항</small></button>)}{workspace.unassignedBlocks.length > 0 && <p className="form-error">미분류 블록 {workspace.unassignedBlocks.length}개</p>}</aside>
      <main className="import-workspace-list"><header><strong>{selectedGroup?.title ?? "문항"}</strong><div><button type="button" className={filter === "all" ? "is-selected" : ""} onClick={() => setFilter("all")}>전체</button><button type="button" className={filter === "review" ? "is-selected" : ""} onClick={() => setFilter("review")}>검토 필요</button></div></header><div className="workspace-question-list-scroll">{visibleQuestions.map((question) => <article key={question.id} className={question.id === selectedQuestionId ? "is-selected" : ""}><button type="button" className="import-workspace-question-select" aria-pressed={question.id === selectedQuestionId} aria-label={`${question.displayQuestionNumber}번 문항 선택`} onClick={() => setSelectedQuestionId(question.id)}><div><strong>{question.displayQuestionNumber}번</strong><p><MathText text={getEditableContentSegments(question).filter(segment => segment.type === "text").map(segment => segment.text).join(" ").slice(0, 110) || "수식·그림 문항 · 선택하여 미리보기"} /></p><small>{question.status === "ready" ? "준비됨" : question.warnings[0] ?? "검토 필요"}</small></div></button></article>)}</div></main>
      <aside className="import-workspace-editor"><aside aria-label="학습 카드 후보">{selectedGroup?.entryMetadata?.learningBlocks?.length ? <details><summary>학습 카드 후보 {selectedGroup.entryMetadata.learningBlocks.length}개</summary><p>검토한 자료를 저장할 때 함께 추가합니다. 기존 특강이나 개념 관계는 자동 생성하지 않습니다.</p><button type="button" className="btn-secondary" disabled={busy || Boolean(workspace.commitAttempt)} onClick={() => { if (rejectMaintenanceMutation()) return; setWorkspace(current => ({ ...current, groups: current.groups.map(group => group.id === selectedGroupId ? { ...group, excludedLearningBlockIds: [] } : group) })); }}>전체 포함</button><button type="button" className="btn-secondary" disabled={busy || Boolean(workspace.commitAttempt)} onClick={() => { if (rejectMaintenanceMutation()) return; setWorkspace(current => ({ ...current, groups: current.groups.map(group => group.id === selectedGroupId ? { ...group, excludedLearningBlockIds: group.entryMetadata?.learningBlocks?.map(block => block.id) } : group) })); }}>전체 제외</button>{selectedGroup.entryMetadata.learningBlocks.map(block => <label key={block.id} style={{display:"flex",gap:8,minHeight:36,fontSize:14}}><input type="checkbox" disabled={busy || Boolean(workspace.commitAttempt)} checked={!selectedGroup.excludedLearningBlockIds?.includes(block.id)} onChange={event => { if (rejectMaintenanceMutation()) return; const include = event.target.checked; setWorkspace(current => ({ ...current, groups: current.groups.map(group => group.id === selectedGroupId ? { ...group, excludedLearningBlockIds: include ? (group.excludedLearningBlockIds ?? []).filter(id => id !== block.id) : [...(group.excludedLearningBlockIds ?? []),block.id] } : group) })); }}/>{block.sourceQuestionNumber}번 · {block.title}</label>)}</details> : null}</aside>{selectedQuestion && <><section className="workspace-review-reasons" aria-label="문항 검토 안내"><strong>검토할 내용</strong>{selectedIssues.length ? <ul>{selectedIssues.map(issue => <li key={issue.id}>{issue.severity === "error" ? "수정 필요: " : "확인 권장: "}{issue.message}</li>)}</ul> : <p>앱 검사에서 추가 오류를 찾지 못했습니다.</p>}{selectedQuestion.status !== "ready" && !selectedQuestion.warnings.length && <p>가져온 파일에서 검토를 요청했습니다. 구체적인 사유는 제공되지 않았습니다.</p>}{cannotConfirmReview && <p className="form-hint">참조 오류·그림 비교·정답 확인을 먼저 완료하세요.</p>}<button type="button" className="btn-secondary" disabled={busy || maintenanceBlocked || cannotConfirmReview || selectedQuestion.status === "ready"} onClick={() => { updateQuestion({ status: "ready", needsReview: false, warnings: [], warning: undefined, answer: selectedQuestion.answer ? { ...selectedQuestion.answer, needsReview: false } : undefined }); }}>내용 비교 확인 완료</button></section>{selectedMeta?.length === 1 && selectedMeta[0].studyAssessment && <AssessmentCard key={selectedQuestion.id} meta={selectedMeta[0]} answer={selectedQuestion.answer as import("../../../types").SheetAnswerItem | undefined} disabled={busy || maintenanceBlocked} onAnswerChange={answer => updateQuestion({ answer: { ...selectedQuestion.answer, ...answer } })} onMetaChange={meta => setWorkspace(current => ({ ...current, groups: current.groups.map(group => group.id !== selectedGroupId ? group : { ...group, entryMetadata: { ...group.entryMetadata, questionMeta: group.entryMetadata?.questionMeta?.map(item => normalizeQuestionNumber(item.questionNumber) === normalizeQuestionNumber(meta.questionNumber) ? meta : item) } }) }))} />} <WorkspaceQuestionPreview question={selectedQuestion} resolveImage={resolvePageUrl ? loadPageUrl : undefined} /></>}<details className="workspace-content-editor"><summary>내용 편집</summary><p className="form-hint">수식은 LaTeX로 입력합니다. 줄을 나누려면 수식 안에 aligned 환경을 사용하고 줄 끝에 {"\\\\"}를 입력하세요. 미리보기에서 표시를 확인할 수 있습니다.</p><button type="button" disabled={busy || recoveryAvailable || maintenanceBlocked || Boolean(workspace.commitAttempt)} onClick={() => setHotspotEditorOpen(true)}>파란 점·해설 연결</button>{selectedQuestion ? <><label>현재 문항 번호<input disabled={maintenanceBlocked} value={selectedQuestion.displayQuestionNumber} onChange={(event) => updateQuestion({ displayQuestionNumber: event.target.value })} /></label><label>원본 문항 번호<input disabled={maintenanceBlocked} value={selectedQuestion.sourceQuestionNumber ?? ""} onChange={(event) => updateQuestion({ sourceQuestionNumber: event.target.value })} /></label>{hasAmbiguousLegacySourceText(selectedQuestion) && <p className="form-error" role="alert">기존 본문이 여러 text segment로 나뉘어 있어 자동 병합할 수 없습니다. 각 본문 segment를 확인한 뒤 저장하세요.</p>}<h4>문항 내용</h4>{selectedContentSegments.map((segment) => segment.type === "figure" || segment.type === "table" ? <div className="import-workspace-segment-anchor" key={segment.id} role="note"><strong>{segmentLabel(segment)}</strong><span>문항 내 배치를 유지합니다.</span>{segment.type === "table" && <pre>{segment.rows.map((row) => row.join(" | ")).join("\n")}</pre>}</div> : <label key={segment.id}>{segmentLabel(segment)}<textarea disabled={maintenanceBlocked} value={segmentValue(segment)} onChange={(event) => updateQuestionSegment(segment.id, event.target.value)} /></label>)}<h4>선택지</h4>{selectedQuestion.choices.map((choice, index) => <label key={choice.id}>{choice.marker || `선지 ${index + 1}`}<input disabled={maintenanceBlocked} value={choice.content} onChange={(event) => updateQuestion({ choices: selectedQuestion.choices.map((item) => item.id === choice.id ? { ...item, content: event.target.value } : item) })} /></label>)}{selectedQuestion.figures.map(figure => <FigureReviewCard key={figure.id} figure={figure} disabled={busy || maintenanceBlocked || Boolean(workspace.commitAttempt)} resolveImageUrl={resolveFigureUrl} onChange={patch => updateQuestion({ figures: selectedQuestion.figures.map(item => item.id === figure.id ? { ...item, ...patch } : item) })} />)}<p className="import-workspace-note">그림 {selectedQuestion.figures.length}개 · 원본 페이지 {selectedQuestion.sourcePageAssets.length}개</p><div className="import-workspace-move"><label>회차 이동<select disabled={maintenanceBlocked} value={selectedGroupId} onChange={(event) => moveSelectedQuestion(event.target.value, 0)}>{workspace.groups.map((group) => <option key={group.id} value={group.id}>{group.title}</option>)}</select></label><button type="button" onClick={() => moveSelectedQuestion(selectedGroupId, selectedQuestionIndex - 1)} disabled={maintenanceBlocked || selectedQuestionIndex <= 0}>위로</button><button type="button" onClick={() => moveSelectedQuestion(selectedGroupId, selectedQuestionIndex + 1)} disabled={maintenanceBlocked || selectedQuestionIndex < 0 || selectedQuestionIndex >= questions.length - 1}>아래로</button></div></> : <p>문항을 선택하세요.</p>}</details></aside>
    </div><footer className="import-workspace-footer"><span>{workspace.groups.reduce((sum, group) => sum + group.questions.length, 0)}문항 · 검토 권장 {warnings.filter((warning) => warning.severity === "warning").length}개</span><span role="status">{draftSaveState === "saving" ? "초안 저장 중…" : draftSaveState === "saved" ? memoryOnlyWithAssets ? "이 창에서만 임시 유지됨" : "초안 저장됨" : draftSaveState === "error" ? "초안 저장 실패" : ""}</span><button type="button" className="btn-secondary" onClick={requestClose} disabled={busy || recoveryBusy || maintenanceBlocked}>{workspace.commitAttempt ? "완료하고 닫기" : "닫기"}</button><button type="button" className="btn-primary" disabled={busy || recoveryBusy || maintenanceBlocked || recoveryAvailable || recoveryChecking} onClick={() => void save()}>{busy ? "저장 중…" : committedAwaitingDraftCleanup ? "초안 정리 재시도" : commitUncertain ? "저장 결과 다시 확인" : "시험지 저장"}</button></footer>
    {saveError && <p className="form-error" role="alert">{saveError}{!workspace.commitAttempt && <button type="button" className="btn-secondary" onClick={() => void save()} disabled={busy}>다시 저장</button>}</p>}
    {draftSaveError && <p className="form-error" role="alert">{draftSaveError}<button type="button" className="btn-secondary" onClick={() => void retryDraftSave()} disabled={draftSaveState === "saving" || Boolean(workspace.commitAttempt) || maintenanceBlocked || busy}>초안 다시 저장</button></p>}
    <Dialog open={closePromptOpen} onClose={() => setClosePromptOpen(false)} title="가져오기 작업실을 닫을까요?" closeDisabled={closeBusy} busy={closeBusy}>
      <p>{memoryOnlyWithAssets ? "이 창의 임시 이미지는 닫은 뒤 복구할 수 없습니다. 계속 편집하거나 이번 가져오기를 취소하세요." : "검토 중인 내용을 보관하고 나중에 이어서 작업하거나, 이번 가져오기를 취소할 수 있습니다."}</p>
      {closeError && <p className="form-error" role="alert">{closeError}</p>}
      {memoryOnlyWithAssets && <p className="form-hint">이미 저장된 시험지는 유지됩니다.</p>}
      <footer className="dialog-actions"><button type="button" className="btn-secondary" onClick={() => setClosePromptOpen(false)} disabled={closeBusy}>계속 편집</button>{!memoryOnlyWithAssets && <button type="button" className="btn-secondary" onClick={() => void preserveAndClose()} disabled={closeBusy}>보관하고 닫기</button>}<button type="button" className="btn-danger" onClick={() => void discardAndClose()} disabled={closeBusy}>{closeBusy ? "폐기 중…" : "가져오기 취소"}</button></footer>
    </Dialog>
  </Dialog>;
}
