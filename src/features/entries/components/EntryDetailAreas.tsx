import type { ReactNode } from "react";

export function ProblemSheetHeader({ children }: { children: ReactNode }) { return <header className="entry-detail-area entry-detail-area--header">{children}</header>; }
export function QuestionWorkspace({ children }: { children: ReactNode }) { return <section className="entry-detail-area entry-detail-area--workspace">{children}</section>; }
export function SecondaryStudyViews({ children }: { children: ReactNode }) { return <section className="entry-detail-area entry-detail-area--secondary">{children}</section>; }
export function ReviewExportDialogs({ children }: { children: ReactNode }) { return <>{children}</>; }
