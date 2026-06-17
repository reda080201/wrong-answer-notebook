import { useCallback, useEffect, useState } from "react";
import { SUBJECTS } from "../types";

const STORAGE_KEY = "wrong-answer-subject-order";

function loadOrder(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...SUBJECTS];
    const parsed = JSON.parse(raw) as string[];
    const merged = [...parsed];
    for (const s of SUBJECTS) {
      if (!merged.includes(s)) merged.push(s);
    }
    return merged.filter((s) => (SUBJECTS as readonly string[]).includes(s));
  } catch {
    return [...SUBJECTS];
  }
}

export function useSubjectOrder() {
  const [order, setOrder] = useState<string[]>(loadOrder);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  }, [order]);

  const moveSubject = useCallback((fromIndex: number, toIndex: number) => {
    setOrder((prev) => {
      if (fromIndex === toIndex) return prev;
      if (fromIndex < 0 || toIndex < 0) return prev;
      if (fromIndex >= prev.length || toIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      return next;
    });
  }, []);

  const resetOrder = useCallback(() => {
    setOrder([...SUBJECTS]);
  }, []);

  return { subjectOrder: order, moveSubject, resetOrder };
}
