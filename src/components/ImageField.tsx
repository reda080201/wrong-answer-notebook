import { useEffect, useState } from "react";
import { getImageUrl, pickImages, saveImageFiles } from "../api";

interface ImageFieldProps {
  label: string;
  images: string[];
  onChange: (images: string[]) => void;
  onRemove: (filename: string) => void;
}

export default function ImageField({
  label,
  images,
  onChange,
  onRemove,
}: ImageFieldProps) {
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const map: Record<string, string> = {};
      const failures = new Set<string>();
      for (const f of images) {
        try {
          map[f] = await getImageUrl(f);
        } catch {
          failures.add(f);
        }
      }
      if (!cancelled) {
        setPreviews(map);
        setFailed(failures);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [images]);

  const handleAdd = async () => {
    setUploadError(null);
    try {
      const added = await pickImages();
      if (added.length) onChange([...images, ...added]);
    } catch (error) {
      setUploadError(
        error instanceof Error && error.message
          ? error.message
          : "이미지를 추가하지 못했습니다.",
      );
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    setUploadError(null);
    try {
      const added = await saveImageFiles(event.dataTransfer.files);
      if (added.length) onChange([...images, ...added]);
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
      <div
        className={`image-upload-area ${dragging ? "dragging" : ""}`}
        onClick={handleAdd}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        📷 {label} 이미지 추가 · 드래그 앤 드롭
      </div>
      {uploadError && (
        <p className="image-field-error" role="alert">
          {uploadError}
        </p>
      )}
      {images.length > 0 && (
        <div className="pending-images">
          {images.map((f) => (
            <div key={f} className="pending-thumb">
              {previews[f] ? (
                <img src={previews[f]} alt="" loading="lazy" />
              ) : failed.has(f) ? (
                <span className="image-load-error">불러오기 실패</span>
              ) : null}
              <button
                type="button"
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
