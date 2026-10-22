import { useCallback, useEffect, useRef } from "react";
import { getImageUrl } from "../../../api";
import { normalizeImportImageKey } from "../../../utils/importImageReferences";

/** Lazy object URLs owned by this view, never by the persistent image cache. */
export function useImportFigureUrls(files: File[]) {
  const owned = useRef(new Map<File, string>());
  const ownerFiles = useRef(files);
  useEffect(() => { const cache = owned.current; return () => { cache.forEach(url => URL.revokeObjectURL(url)); cache.clear(); }; }, []);
  return useCallback(async (filename: string) => {
    if (ownerFiles.current !== files) { owned.current.forEach(url => URL.revokeObjectURL(url)); owned.current.clear(); ownerFiles.current = files; }
    const matches = files.filter(file => normalizeImportImageKey(file.name) === normalizeImportImageKey(filename));
    if (matches.length > 1) throw new Error("같은 이름의 임시 이미지가 여러 개입니다.");
    if (!matches.length) return getImageUrl(filename);
    const file = matches[0];
    let url = owned.current.get(file);
    if (!url) { url = URL.createObjectURL(file); owned.current.set(file, url); }
    return url;
  }, [files]);
}
