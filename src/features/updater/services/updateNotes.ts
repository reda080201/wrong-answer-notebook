export function sanitizeReleaseNotes(input?: string): string {
  if (!input) return "이 버전의 상세 변경사항은 GitHub Release에서 확인할 수 있습니다.";
  return input.replace(/<[^>]*>/g, "").replace(/javascript:/gi, "").slice(0, 12_000).trim();
}

