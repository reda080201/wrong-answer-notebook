/** Human-facing filenames use the local calendar; persisted timestamps remain UTC. */
export function backupFilename(extension: "zip" | "json", now = new Date()): string {
  const date = [String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")].join("-");
  return `wrong-answer-backup-${date}.${extension}`;
}
