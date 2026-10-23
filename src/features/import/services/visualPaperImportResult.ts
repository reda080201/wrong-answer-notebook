import type { ImportAssetSessionManifest } from "../../import-workspace/model/importWorkspace";

export interface VisualPaperImportResult {
  responseText: string;
  visionAnalysisText?: string;
  originalFiles?: File[];
  visionJob?: import("../vision/visionJob").VisionJobDraft;
  sourcePageImages: string[];
  assetSession: ImportAssetSessionManifest;
}

export class VisualPaperImportError extends Error {
  constructor(message: string, readonly assetSession?: ImportAssetSessionManifest, readonly analysisText?: string, readonly originalFiles?: File[]) {
    super(message);
    this.name = "VisualPaperImportError";
  }
}
