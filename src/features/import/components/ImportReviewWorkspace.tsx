import type { ReactNode } from "react";
import { ClipboardCheck } from "lucide-react";
import FullscreenDialog from "../../../shared/ui/FullscreenDialog";
import { Badge, ScrollArea, Toolbar } from "../../../shared/ui";
import "./ImportReviewWorkspace.css";

export interface ImportReviewWorkspaceProps {
  open: boolean;
  title: ReactNode;
  onClose(): void;
  children: ReactNode;
  summary?: ReactNode;
  status?: ReactNode;
  sidebar?: ReactNode;
  questionNavigator?: ReactNode;
  footer?: ReactNode;
  bodyLabel?: string;
}

function ReviewSidebar({ sidebar, questionNavigator }: Pick<ImportReviewWorkspaceProps, "sidebar" | "questionNavigator">) {
  if (!sidebar && !questionNavigator) return undefined;

  return (
    <div className="import-review-workspace-sidebar-content">
      {questionNavigator && <section aria-label="문항 탐색">{questionNavigator}</section>}
      {sidebar && <section aria-label="검수 도구">{sidebar}</section>}
    </div>
  );
}

export function ImportReviewWorkspace({
  open,
  title,
  onClose,
  children,
  summary,
  status,
  sidebar,
  questionNavigator,
  footer,
  bodyLabel = "가져오기 검수 본문",
}: ImportReviewWorkspaceProps) {
  const resolvedSidebar = sidebar || questionNavigator
    ? <ReviewSidebar sidebar={sidebar} questionNavigator={questionNavigator} />
    : undefined;

  return (
    <FullscreenDialog
      open={open}
      title={title}
      onClose={onClose}
      sidebar={resolvedSidebar}
      footer={footer}
    >
      <div className="import-review-workspace">
        {(summary || status) && (
          <section className="import-review-workspace-summary" aria-label="검수 요약">
            <Toolbar align="between" label="검수 상태">
              <div className="import-review-workspace-summary-copy">
                <ClipboardCheck size={18} aria-hidden="true" />
                <div>{summary}</div>
              </div>
              {status && (
                <div role="status" aria-live="polite">
                  <Badge tone="info">{status}</Badge>
                </div>
              )}
            </Toolbar>
          </section>
        )}
        <ScrollArea className="import-review-workspace-body" aria-label={bodyLabel}>
          {children}
        </ScrollArea>
      </div>
    </FullscreenDialog>
  );
}

export default ImportReviewWorkspace;
