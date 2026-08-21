import { useState } from "react";
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
  };
}
