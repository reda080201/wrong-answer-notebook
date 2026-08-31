export type NavigationDestination = "section" | "learning_hub" | "question_bank" | "library";

export interface NavigationSnapshot {
  destination: NavigationDestination;
  section?: string;
  entryId?: string | null;
  questionNumber?: string | null;
  search?: string;
  filters?: Record<string, string | number | boolean | null>;
  sort?: string;
  questionBankView?: string;
  inspectorId?: string | null;
  learningBlock?: { entryId: string; blockId: string } | null;
  libraryPath?: string[];
  scrollTop?: number;
  scrollTops?: Record<string, number>;
}

export interface NavigationHistoryController {
  current(): NavigationSnapshot | null;
  push(snapshot: NavigationSnapshot): void;
  back(): NavigationSnapshot | null;
  forward(): NavigationSnapshot | null;
  clear(): void;
}

export function createNavigationHistory(limit = 50): NavigationHistoryController {
  const stack: NavigationSnapshot[] = [];
  let index = -1;
  return {
    current: () => index >= 0 ? stack[index] ?? null : null,
    push(snapshot) {
      const last = stack[index];
      if (last && JSON.stringify(last) === JSON.stringify(snapshot)) return;
      stack.splice(index + 1);
      stack.push(snapshot);
      if (stack.length > limit) stack.shift();
      index = stack.length - 1;
    },
    back() { if (index <= 0) return null; index -= 1; return stack[index] ?? null; },
    forward() { if (index >= stack.length - 1) return null; index += 1; return stack[index] ?? null; },
    clear() { stack.length = 0; index = -1; },
  };
}
