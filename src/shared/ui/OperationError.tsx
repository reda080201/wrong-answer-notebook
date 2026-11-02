/** Keep specific validation messages; translate only recognized transport/storage failures. */
export function operationErrorSummary(message: string): string {
  const status = message.match(/(?:HTTP(?:\s+(?:status|error))?|AI 제공자 오류|status(?:\s+code)?)\s*[:=]?\s*(401|403|429|5\d{2})\b/i)?.[1];
  if (status === "401") return "AI 인증에 실패했습니다. API 설정에서 키와 제공자를 확인하세요.";
  if (status === "403") return "AI 요청 권한이 없습니다. 해당 모델과 프로젝트의 사용 권한을 확인하세요.";
  if (status === "429") return "AI 제공자의 요청 한도에 도달했습니다. 잠시 후 직접 다시 시도하고 제공자의 사용 한도를 확인하세요.";
  if (status?.startsWith("5")) return "AI 제공자 서버에서 요청을 처리하지 못했습니다. 연결 상태를 확인하고 잠시 후 다시 시도하세요.";
  if (/quota|QuotaExceededError/i.test(message)) return "저장 공간이 부족해 작업을 완료하지 못했습니다. 백업을 확보하고 저장 공간을 확인한 뒤 다시 시도하세요.";
  if (/ENOENT|no such file or directory/i.test(message)) return "필요한 파일을 찾지 못했습니다. 원본 파일과 저장 위치를 확인하세요.";
  if (/Failed to fetch|Network request failed|ECONNREFUSED|ETIMEDOUT/i.test(message)) return "연결을 완료하지 못했습니다. 인터넷과 연결 대상의 실행 상태를 확인한 뒤 다시 시도하세요.";
  return message;
}

export default function OperationError({ message }: { message: string }) {
  const summary = operationErrorSummary(message);
  return <div className="form-error" role="alert"><p>{summary}</p>{summary !== message && <details><summary>기술 정보</summary><p className="operation-error-detail">{message}</p></details>}</div>;
}
