import type { ZipImportAsset } from "./zipImport";

/** Hashes verify byte identity only. They never establish mathematical equality. */
export async function validateFigureSourceHashes(jsonText: string, assets: ZipImportAsset[]): Promise<void> {
  const files = new Map(assets.map(asset => [asset.sourcePath, asset.file]));
  const hashes = new Map<string, string>();
  const claims: Array<{ path: string; claim: string }> = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const representations = record.representations && typeof record.representations === "object" ? record.representations as Record<string, unknown> : record;
    const cleaned = representations.cleaned as Record<string, unknown> | undefined;
    const original = representations.original as Record<string, unknown> | undefined;
    const claim = typeof cleaned?.sourceImageHash === "string" ? cleaned.sourceImageHash.replace(/^sha256:/i, "") : "";
    // Legacy non-SHA placeholders remain unverified; a real SHA declaration must match.
    if (/^[a-f\d]{64}$/i.test(claim) && typeof original?.image === "string") {
      const path = original.image;
      if (!files.has(path)) throw new Error(`원본 해시를 확인할 파일이 없습니다: ${path}`);
      claims.push({ path, claim: claim.toLowerCase() });
    }
    Object.values(record).forEach(visit);
  };
  visit(JSON.parse(jsonText));
  // Hash one image at a time; large packages must not decode/hash every asset together.
  for (const { path, claim } of claims) {
    let actual = hashes.get(path);
    if (!actual) {
      const bytes = await crypto.subtle.digest("SHA-256", await files.get(path)!.arrayBuffer());
      actual = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
      hashes.set(path, actual);
    }
    if (actual !== claim) throw new Error(`정리본의 원본 SHA-256이 실제 파일과 다릅니다: ${path}`);
  }
}
