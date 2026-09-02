import { useEffect, useState } from "react";
import { getImageUrl } from "../api";
import Dialog from "../shared/ui/Dialog";

interface ImageGalleryProps {
  filenames: string[];
  variant?: "grid" | "inline" | "fill";
  alt?: string;
}

function ImageThumb({
  filename,
  variant,
  alt,
}: {
  filename: string;
  variant: "grid" | "inline" | "fill";
  alt: string;
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
        <button
          type="button"
          className="image-fill-wrap"
          onClick={() => setLightbox(true)}
          aria-label={`${alt} 이미지 열기`}
        >
          <img src={src} alt={alt} className="image-fill-img" loading="lazy" />
        </button>
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
              alt={`${alt} 확대`}
              className="modal-img-full"
              onClick={(e) => e.stopPropagation()}
            />
        </Dialog>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`image-thumb ${variant === "inline" ? "image-thumb--inline" : ""}`}
        onClick={() => setLightbox(true)}
        aria-label={`${alt} 이미지 열기`}
      >
        <img src={src} alt={alt} loading="lazy" />
      </button>
      <Dialog open={lightbox} onClose={() => setLightbox(false)} className="modal-overlay" backdropClassName="dialog-host" ariaLabel="이미지 확대 보기">
          <button
            type="button"
            className="modal-close"
            onClick={() => setLightbox(false)}
            aria-label="닫기"
          >
            ✕
          </button>
          <img src={src} alt={`${alt} 확대`} onClick={(e) => e.stopPropagation()} />
      </Dialog>
    </>
  );
}

export default function ImageGallery({
  filenames,
  variant = "grid",
  alt = "첨부 이미지",
}: ImageGalleryProps) {
  if (!filenames.length) return null;

  const thumbVariant = variant === "fill" ? "fill" : variant;

  return (
    <div className={`image-gallery image-gallery--${variant}`}>
      {filenames.map((f) => (
        <ImageThumb key={f} filename={f} variant={thumbVariant} alt={alt} />
      ))}
    </div>
  );
}
