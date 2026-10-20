import type { ReactNode } from "react";
import { useRealExamProtection } from "../services/realExamProtection";
import Dialog from "../../../shared/ui/Dialog";

export default function ProtectedExamContent({ sourceId, onClose, children }: { sourceId?: string; onClose(): void; children: ReactNode }) {
  const protection = useRealExamProtection();
  if (sourceId && (protection.unavailable || protection.sourceIds.has(sourceId))) return <Dialog open title="실전 시험 자료 보호" onClose={onClose}><p role="status">진행 중 실전 시험의 자료는 제출 후 확인·편집·공유할 수 있습니다. 시험 기록을 읽지 못한 경우 먼저 다시 불러오세요.</p><button type="button" onClick={onClose}>닫기</button></Dialog>;
  return children;
}
