import { useEffect, useState } from "react";
import { getImageUrl } from "../api";
import Dialog from "../shared/ui/Dialog";

interface ImageGalleryProps {
  filenames: string[];
  variant?: "grid" | "inline" | "fill";
}

function ImageThumb({
  filename,
  variant,
}: {
  filename: string;
  variant: "grid" | "inline" | "fill";
}) {
  const [src, setSrc] = useState("");
  const [error, setError] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc("");
    setError(false);
    getImageUrl(filename)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [filename]);

  if (error) {
    return (
      <div
        className={
          variant === "fill" ? "image-fill-error" : "image-thumb image-thumb--error"
        }
      >
        이미지를 불러올 수 없습니다
      </div>
    );
  }

  if (!src) {
    return (
      <div
        className={
          variant === "fill" ? "image-fill-loading" : "image-thumb image-thumb--loading"
        }
      />
    );
  }

  if (variant === "fill") {
    return (
      <>
        <div
          className="image-fill-wrap"
          onClick={() => setLightbox(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setLightbox(true)}
        >
          <img src={src} alt="첨부 이미지" className="image-fill-img" loading="lazy" />
        </div>
        <Dialog open={lightbox} onClose={() => setLightbox(false)} className="modal-overlay modal-overlay--fullscreen" backdropClassName="dialog-host" ariaLabel="이미지 확대 보기">
            <button
              type="button"
              className="modal-close"
              onClick={() => setLightbox(false)}
              aria-label="닫기"
            >
              ✕
            </button>
            <img
              src={src}
              alt="확대 이미지"
              className="modal-img-full"
              onClick={(e) => e.stopPropagation()}
            />
        </Dialog>
      </>
    );
  }

  return (
    <>
      <div
        className={`image-thumb ${variant === "inline" ? "image-thumb--inline" : ""}`}
        onClick={() => setLightbox(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setLightbox(true)}
      >
        <img src={src} alt="첨부 이미지" loading="lazy" />
      </div>
      <Dialog open={lightbox} onClose={() => setLightbox(false)} className="modal-overlay" backdropClassName="dialog-host" ariaLabel="이미지 확대 보기">
          <button
            type="button"
            className="modal-close"
            onClick={() => setLightbox(false)}
            aria-label="닫기"
          >
            ✕
          </button>
          <img src={src} alt="확대 이미지" onClick={(e) => e.stopPropagation()} />
      </Dialog>
    </>
  );
}

export default function ImageGallery({
  filenames,
  variant = "grid",
}: ImageGalleryProps) {
  if (!filenames.length) return null;

  const thumbVariant = variant === "fill" ? "fill" : variant;

  return (
    <div className={`image-gallery image-gallery--${variant}`}>
      {filenames.map((f) => (
        <ImageThumb key={f} filename={f} variant={thumbVariant} />
      ))}
    </div>
  );
}
