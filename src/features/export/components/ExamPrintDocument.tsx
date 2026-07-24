import type { ExamPrintModel } from "../types";
import BlankAnswerSheet from "./BlankAnswerSheet";
import ExamPrintQuestion from "./ExamPrintQuestion";

interface ExamPrintDocumentProps {
  model: ExamPrintModel;
  imageUrls: Record<string, string>;
}

export default function ExamPrintDocument({ model, imageUrls }: ExamPrintDocumentProps) {
  const layoutClass = model.preferences.layout === "columns" ? "exam-print-layout-columns" : "";
  return (
    <div className="exam-print-root">
      <section className="exam-print-page">
        {model.includeHeader ? (
          <header className="exam-print-header">
            <h1>{model.title}</h1>
            <div className="exam-print-meta">{model.subject} · {model.scopeLabel} · {model.questionCount}문항</div>
            <div className="exam-print-fields"><span>이름: __________</span><span>날짜: __________</span></div>
          </header>
        ) : null}
        <div className={layoutClass}>
          {model.questions.map((question) => (
            <ExamPrintQuestion key={question.questionNumber} question={question} imageUrls={imageUrls} workspaceSize={model.preferences.workspaceSize} />
          ))}
        </div>
      </section>
      {model.includeAnswerSheet ? <section className="exam-print-page"><BlankAnswerSheet questions={model.questions} /></section> : null}
      {model.includeSourcePages && model.sourcePageImages.length > 0 ? (
        <section className="exam-print-page exam-print-source-pages">
          <h2>원본 페이지</h2>
          {model.sourcePageImages.map((filename) => {
            const src = imageUrls[filename] ?? "";
            return src ? <img key={filename} className="exam-print-img" src={src} alt={`원본 페이지 ${filename}`} /> : <p key={filename}>{filename}</p>;
          })}
        </section>
      ) : null}
      {model.preferences.sourceDisplay === "index-at-end" && model.sourceIndex?.length ? <section className="exam-print-page exam-print-source-index"><h2>출처표</h2><ol>{model.sourceIndex.map((item) => <li key={item.questionNumber}>{item.questionNumber}번 · {item.label}</li>)}</ol></section> : null}
      {Array.from({ length: model.extraScratchPages }, (_, index) => (
        <section key={`scratch-${index}`} className="exam-print-page exam-print-scratch"><h2>연습장 {index + 1}</h2></section>
      ))}
    </div>
  );
}

