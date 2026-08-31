export type NotificationTone = "success" | "info" | "warning" | "error";

export interface NotificationInput {
  message: string;
  tone?: NotificationTone;
  action?: { label: string; run(): void | Promise<void> };
}

/** Small shared shape for toasts, retry notices, and undo snackbars. */
export function normalizeNotification(input: NotificationInput) {
  return { tone: input.tone ?? "info", ...input };
}
