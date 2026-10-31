/** Keep specific validation messages; translate only recognized transport/storage failures. */
export function operationErrorSummary(message: string): string {
  if (/quota|QuotaExceededError/i.test(message)) return "저장 공간이 부족해 작업을 완료하지 못했습니다. 백업을 확보하고 저장 공간을 확인한 뒤 다시 시도하세요.";
  if (/ENOENT|no such file or directory/i.test(message)) return "필요한 파일을 찾지 못했습니다. 원본 파일과 저장 위치를 확인하세요.";
  if (/Failed to fetch|Network request failed|ECONNREFUSED|ETIMEDOUT/i.test(message)) return "연결을 완료하지 못했습니다. 인터넷과 연결 대상의 실행 상태를 확인한 뒤 다시 시도하세요.";
  return message;
}

export default function OperationError({ message }: { message: string }) {
  const summary = operationErrorSummary(message);
  return <div className="form-error" role="alert"><p>{summary}</p>{summary !== message && <details><summary>기술 정보</summary><p className="operation-error-detail">{message}</p></details>}</div>;
}
