import { useEffect, useState } from "react";
import { getImageUrl, pickImages, saveImageFiles } from "../api";

interface ImageFieldProps {
  label: string;
  images: string[];
  onChange: (images: string[]) => void;
  onRemove: (filename: string) => void;
  /** Reports files created by this control so a parent can clean up a cancelled draft. */
  onImagesAdded?: (filenames: string[]) => void;
}

export default function ImageField({
  label,
  images,
  onChange,
  onRemove,
  onImagesAdded,
}: ImageFieldProps) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleAdd = async () => {
    setUploadError(null);
    try {
      const added = await pickImages();
      if (added.length) {
        onImagesAdded?.(added);
        onChange([...images, ...added]);
      }
    } catch (error) {
      setUploadError(
        error instanceof Error && error.message
          ? error.message
          : "이미지를 추가하지 못했습니다.",
      );
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    setUploadError(null);
    try {
      const added = await saveImageFiles(event.dataTransfer.files);
      if (added.length) {
        onImagesAdded?.(added);
        onChange([...images, ...added]);
      }
    } catch (error) {
      setUploadError(
        error instanceof Error && error.message
          ? error.message
          : "드래그한 이미지를 추가하지 못했습니다.",
      );
    }
  };

  return (
    <div className="form-field full">
      <label>{label}</label>
      <button
        type="button"
        aria-label={`${label.replace(/\s*이미지$/, "").trim()} 이미지 추가`.trim()}
        className={`image-upload-area ${dragging ? "dragging" : ""}`}
        onClick={handleAdd}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        📷 이미지 추가 · 드래그 앤 드롭
      </button>
      {uploadError && (
        <p className="image-field-error" role="alert">
          {uploadError}
        </p>
      )}
      {images.length > 0 && (
        <div className="pending-images">
          {images.map((f) => (
            <div key={f} className="pending-thumb">
              <ImagePreview key={f} filename={f} />
              <button
                type="button"
                aria-label={`${f} 이미지 삭제`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(f);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ImagePreview({ filename }: { filename: string }) {
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<{ url: string; state: "loading" | "ready" | "error" }>({ url: "", state: "loading" });
  useEffect(() => {
    let cancelled = false;
    setPreview({ url: "", state: "loading" });
    void (async () => {
      try {
        const url = await getImageUrl(filename);
        if (!cancelled) setPreview({ url, state: url ? "loading" : "error" });
      } catch {
        if (!cancelled) setPreview({ url: "", state: "error" });
      }
    })();
    return () => { cancelled = true; };
  }, [filename, attempt]);
  return <div className="image-field-preview" aria-busy={preview.state === "loading"}>
    {preview.state === "loading" && <span role="status">이미지 불러오는 중…</span>}
    {preview.url && preview.state !== "error" && <img key={attempt} src={preview.url} alt="" loading="lazy"
      onLoad={() => setPreview(value => ({ ...value, state: "ready" }))}
      onError={() => setPreview(value => ({ ...value, state: "error" }))} />}
    {preview.state === "error" && <div role="status"><span>이미지를 불러오지 못했습니다.</span><button type="button" className="btn-secondary" aria-label={`${filename} 이미지 다시 불러오기`} onClick={() => setAttempt(value => value + 1)}>다시 불러오기</button></div>}
  </div>;
}
