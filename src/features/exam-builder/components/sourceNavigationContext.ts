import { createContext } from "react";
import type { QuestionSourceReference } from "../../../types";
export const SourceNavigationContext = createContext<((source: QuestionSourceReference) => Promise<void> | void) | null>(null);
