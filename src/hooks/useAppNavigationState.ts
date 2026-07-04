import { useMemo, useState } from "react";
import type {
  EntryKind,
  ListFilter,
  SortKey,
  WrongAnswerEntry,
} from "../types";
import { buildLearningDashboardStats } from "../utils/conceptAnalytics";
import {
  type DifficultyFilter,
  entryMatchesSearch,
  sortEntries,
} from "../utils/appUi";
import { getTodayReviewCandidates } from "../utils/review";

interface UseAppNavigationStateOptions {
  entries: WrongAnswerEntry[];
  subjectOrder: string[];
}

export function useAppNavigationState({
  entries,
  subjectOrder,
}: UseAppNavigationStateOptions) {
  const [activeSection, setActiveSection] =
    useState<EntryKind>("wrong_answer");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date-desc");
  const [difficultyFilter, setDifficultyFilter] =
    useState<DifficultyFilter>("all");

  const filtered = useMemo(() => {
    const list = entries.filter((entry) => {
      if (entry.entryKind !== activeSection) return false;
      if (subjectFilter && entry.subject !== subjectFilter) return false;
      if (listFilter === "pending" && entry.mastered) return false;
      if (listFilter === "mastered" && !entry.mastered) return false;
      if (listFilter === "difficult" && !entry.difficult) return false;
      if (listFilter === "due" && !getTodayReviewCandidates([entry]).length) {
        return false;
      }
      if (difficultyFilter !== "all" && entry.difficulty !== difficultyFilter) {
        return false;
      }
      return entryMatchesSearch(entry, search);
    });
    return sortEntries(list, sortKey);
  }, [
    entries,
    activeSection,
    subjectFilter,
    listFilter,
    difficultyFilter,
    search,
    sortKey,
  ]);

  const selected = entries.find((entry) => entry.id === selectedId) ?? null;

  const stats = useMemo(() => {
    const sectionEntries = entries.filter(
      (entry) => entry.entryKind === activeSection,
    );
    return {
      total: sectionEntries.length,
      mastered: sectionEntries.filter((entry) => entry.mastered).length,
      pending: sectionEntries.filter((entry) => !entry.mastered).length,
      difficult: sectionEntries.filter((entry) => entry.difficult).length,
    };
  }, [entries, activeSection]);

  const todayReviewCount = useMemo(
    () => getTodayReviewCandidates(entries).length,
    [entries],
  );

  const learningStats = useMemo(
    () => buildLearningDashboardStats(entries),
    [entries],
  );

  const subjectCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const subject of subjectOrder) map[subject] = 0;
    const sectionEntries = entries.filter(
      (entry) => entry.entryKind === activeSection,
    );
    for (const entry of sectionEntries) {
      if (map[entry.subject] !== undefined) map[entry.subject]++;
    }
    return map;
  }, [entries, subjectOrder, activeSection]);

  const linkableTargets = useMemo(() => {
    const targets = new Set<string>();
    for (const entry of entries) {
      targets.add(entry.id.toLowerCase());
      if (entry.title.trim()) {
        targets.add(entry.title.trim().toLowerCase());
      }
    }
    return targets;
  }, [entries]);

  const sectionEntryCount = useMemo(
    () => entries.filter((entry) => entry.entryKind === activeSection).length,
    [entries, activeSection],
  );

  return {
    activeSection,
    setActiveSection,
    selectedId,
    setSelectedId,
    search,
    setSearch,
    subjectFilter,
    setSubjectFilter,
    listFilter,
    setListFilter,
    sortKey,
    setSortKey,
    difficultyFilter,
    setDifficultyFilter,
    filtered,
    selected,
    stats,
    todayReviewCount,
    learningStats,
    subjectCounts,
    linkableTargets,
    sectionEntryCount,
  };
}
