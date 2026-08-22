import { useCallback, useMemo, useState } from "react";
import type { SettingsTab } from "../components/SettingsModal";
import type { WrongAnswerEntry } from "../types";

export function useAppModalController() {
  const [showSettings, setShowSettings] = useState(false);
  const [showLearningHub, setShowLearningHub] = useState(false);
  const [learningHubTarget, setLearningHubTarget] = useState<{ entryId: string; blockId: string } | null>(null);
  const [showQuestionBank, setShowQuestionBank] = useState(false);
  const [showLibraryExplorer, setShowLibraryExplorer] = useState(false);
  const [examHistoryOpen, setExamHistoryOpen] = useState(false);
  const [learningCandidateEntryId, setLearningCandidateEntryId] = useState<string | null>(null);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab | undefined>(undefined);
  const [questionTarget, setQuestionTarget] = useState<{
    entryId: string;
    questionNumber: string;
    requestId: number;
  } | null>(null);
  const [realExamStartEntry, setRealExamStartEntry] = useState<WrongAnswerEntry | null>(null);
  const [realExamMinutes, setRealExamMinutes] = useState(50);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(null);

  const openSettings = useCallback((tab?: SettingsTab) => {
    setSettingsInitialTab(tab);
    setShowSettings(true);
  }, []);
  const closeSettings = useCallback(() => setShowSettings(false), []);
  const controller = useMemo<AppModalControllerGroup>(() => ({
    settings: { open: openSettings, close: closeSettings },
    learningHub: { open: (target) => { setLearningHubTarget(target ?? null); setShowLearningHub(true); }, close: () => setShowLearningHub(false) },
    questionBank: { open: () => setShowQuestionBank(true), close: () => setShowQuestionBank(false) },
    library: { open: () => setShowLibraryExplorer(true), close: () => setShowLibraryExplorer(false) },
    examHistory: { open: () => setExamHistoryOpen(true), close: () => setExamHistoryOpen(false) },
  }), [closeSettings, openSettings]);
  return {
    showSettings, setShowSettings,
    showLearningHub, setShowLearningHub,
    learningHubTarget, setLearningHubTarget,
    showQuestionBank, setShowQuestionBank,
    showLibraryExplorer, setShowLibraryExplorer,
    examHistoryOpen, setExamHistoryOpen,
    learningCandidateEntryId, setLearningCandidateEntryId,
    settingsInitialTab, setSettingsInitialTab,
    questionTarget, setQuestionTarget,
    realExamStartEntry, setRealExamStartEntry,
    realExamMinutes, setRealExamMinutes,
    dismissedUpdateVersion, setDismissedUpdateVersion,
    openSettings, closeSettings,
    controller,
  };
}

export interface AppModalControllerGroup {
  settings: { open(tab?: SettingsTab): void; close(): void };
  learningHub: { open(target?: { entryId: string; blockId: string }): void; close(): void };
  questionBank: { open(): void; close(): void };
  library: { open(): void; close(): void };
  examHistory: { open(): void; close(): void };
}
