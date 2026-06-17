import ImageGallery from "./ImageGallery";
import { LinkifiedText } from "../utils/wikiLinks";

interface ContentBlockProps {
  text?: string;
  images?: string[];
  variant?: "default" | "large" | "fill";
  label?: string;
  onWikiLinkClick: (target: string) => void;
  existingTargets: Set<string>;
}

export default function ContentBlock({
  text,
  images = [],
  variant = "default",
  label,
  onWikiLinkClick,
  existingTargets,
}: ContentBlockProps) {
  const hasText = Boolean(text?.trim());
  const hasImages = images.length > 0;

  if (!hasText && !hasImages) return null;

  const galleryVariant = variant === "fill" ? "fill" : variant === "large" ? "inline" : "grid";

  return (
    <div
      className={`content-block ${variant === "large" ? "content-block--large" : ""} ${variant === "fill" ? "content-block--fill" : ""}`}
    >
      {label && <h4 className="content-block-label">{label}</h4>}
      {hasText && (
        <div className="content-block-text">
          <LinkifiedText
            text={text}
            onLinkClick={onWikiLinkClick}
            existingTargets={existingTargets}
          />
        </div>
      )}
      {hasImages && (
        <ImageGallery filenames={images} variant={galleryVariant} />
      )}
    </div>
  );
}
