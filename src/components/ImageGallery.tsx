import { useEffect, useRef, useState } from "react";
import Dialog from "../shared/ui/Dialog";
import { useImagePreviewResolver } from "../shared/ui/ImagePreviewContext";

interface ImageGalleryProps {
  filenames: string[];
  variant?: "grid" | "inline" | "fill";
  alt?: string;
  resolveImageUrl?: (filename: string) => Promise<string>;
}
type Resolver = NonNullable<ImageGalleryProps["resolveImageUrl"]>;
type Result = { resolver: Resolver; attempt: number; url?: string; error?: boolean };

function ImageThumb({ filename, variant, alt, resolveImageUrl, returnFocusFallback }: {
  filename: string; variant: "grid" | "inline" | "fill"; alt: string; resolveImageUrl: Resolver; returnFocusFallback: () => HTMLElement | null;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const current = result?.resolver === resolveImageUrl && result.attempt === attempt ? result : null;
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => resolveImageUrl(filename)).then(url => {
      if (!cancelled) setResult({ resolver: resolveImageUrl, attempt, url: url || undefined, error: !url });
    }).catch(() => {
      if (!cancelled) setResult({ resolver: resolveImageUrl, attempt, error: true });
    });
    return () => { cancelled = true; };
  }, [filename, resolveImageUrl, attempt]);
  const fail = () => setResult({ resolver: resolveImageUrl, attempt, error: true });
  const retry = () => setAttempt(value => value + 1);
  const errorContent = <div role="alert" className={variant === "fill" ? "image-fill-error" : "image-thumb image-thumb--error"}>
    <p>이미지를 불러올 수 없습니다</p><p>저장된 연결은 유지됩니다.</p>
    <button type="button" className="btn-secondary btn-sm" onClick={retry}>이미지 다시 불러오기</button>
  </div>;
  const loading = <div role="status" className={variant === "fill" ? "image-fill-loading" : "image-thumb image-thumb--loading"}>이미지를 불러오는 중…</div>;
  return <>
    {current?.error ? (!lightbox && errorContent) : current?.url ? <button type="button"
      className={variant === "fill" ? "image-fill-wrap" : `image-thumb ${variant === "inline" ? "image-thumb--inline" : ""}`}
      onClick={() => setLightbox(true)} aria-label={`${alt} 이미지 열기`}>
      <img src={current.url} alt={alt} className={variant === "fill" ? "image-fill-img" : undefined} loading="lazy" onError={fail} />
    </button> : (!lightbox && loading)}
    <Dialog open={lightbox} onClose={() => setLightbox(false)} returnFocusFallback={returnFocusFallback} className={`modal-overlay${variant === "fill" ? " modal-overlay--fullscreen" : ""}`} backdropClassName="dialog-host" ariaLabel="이미지 확대 보기">
      <button type="button" className="modal-close" onClick={() => setLightbox(false)} aria-label="닫기">✕</button>
      {current?.error ? errorContent : current?.url ? <img src={current.url} alt={`${alt} 확대`} className={variant === "fill" ? "modal-img-full" : undefined} onError={fail} onClick={event => event.stopPropagation()} /> : loading}
    </Dialog>
  </>;
}

export default function ImageGallery({ filenames, variant = "grid", alt = "첨부 이미지", resolveImageUrl }: ImageGalleryProps) {
  const contextResolver = useImagePreviewResolver();
  const galleryRef = useRef<HTMLDivElement>(null);
  const resolver = resolveImageUrl ?? contextResolver;
  if (!filenames.length) return null;
  return <div ref={galleryRef} tabIndex={-1} className={`image-gallery image-gallery--${variant}`}>
    {filenames.map(filename => <ImageThumb key={filename} filename={filename} variant={variant} alt={alt} resolveImageUrl={resolver} returnFocusFallback={() => galleryRef.current} />)}
  </div>;
}
