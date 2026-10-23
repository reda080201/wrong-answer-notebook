import { useState } from "react";
import type { EntryFormData, StructuredQuestion } from "../../../types";
import ImageGallery from "../../../components/ImageGallery";
import { importSourcePreview } from "../services/importSourcePreview";

export default function ImportSourcePreview({ question, draft, resolveImageUrl }: {
  question: StructuredQuestion; draft: Partial<EntryFormData>; resolveImageUrl: (filename: string) => Promise<string>;
}) {
  const [allPagesOpen, setAllPagesOpen] = useState(false);
  const { images, ambiguous } = importSourcePreview(question, draft);
  const remaining = [...new Set(draft.sourcePageImages ?? [])].filter(image => !images.includes(image));
  return <div className="import-review-source-content">
    <strong>{question.questionNumber}번 연결된 원본</strong>
    {ambiguous && <p role="status">문항 번호나 파일 연결이 중복되어, 명시적으로 확인된 원본만 표시합니다.</p>}
    {images.length ? <ImageGallery filenames={images} variant="fill" alt="연결된 원본" resolveImageUrl={resolveImageUrl} /> : <p>연결된 원본이 없습니다. 원본 페이지를 직접 확인하세요.</p>}
    {!!remaining.length && <details onToggle={event => setAllPagesOpen(event.currentTarget.open)}>
      <summary>다른 원본 페이지 보기 ({remaining.length}개)</summary>
      {allPagesOpen && <ImageGallery filenames={remaining} variant="fill" alt="자료 원본 페이지" resolveImageUrl={resolveImageUrl} />}
    </details>}
  </div>;
}
