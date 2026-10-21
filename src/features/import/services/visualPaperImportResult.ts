import type { ImportAssetSessionManifest } from "../../import-workspace/model/importWorkspace";

export interface VisualPaperImportResult {
  responseText: string;
  sourcePageImages: string[];
  assetSession: ImportAssetSessionManifest;
}

export class VisualPaperImportError extends Error {
  constructor(message: string, readonly assetSession?: ImportAssetSessionManifest) {
    super(message);
    this.name = "VisualPaperImportError";
  }
}
