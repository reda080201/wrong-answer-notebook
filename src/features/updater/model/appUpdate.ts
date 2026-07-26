export type AppUpdateErrorCode = "check_failed" | "download_failed" | "signature_failed" | "install_failed" | "unsupported_platform" | "invalid_manifest";

export type AppUpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "up_to_date"; currentVersion: string; checkedAt: string }
  | { status: "available"; currentVersion: string; latestVersion: string; notes?: string; publishedAt?: string; contentLength?: number }
  | { status: "downloading"; latestVersion: string; downloadedBytes: number; totalBytes?: number; percent?: number }
  | { status: "installing"; latestVersion: string }
  | { status: "restart_required"; latestVersion: string }
  | { status: "offline"; message: string; checkedAt: string }
  | { status: "error"; code: AppUpdateErrorCode; message: string };

export interface AvailableUpdate { currentVersion: string; latestVersion: string; notes?: string; publishedAt?: string; contentLength?: number; }

