import { useEffect, useMemo, useRef, useState } from "react";
import type { QuestionSolutionHotspot, WrongAnswerEntry } from "../../types";
import OriginalPageExamReader from "../exam/components/OriginalPageExamReader";
import QuestionSolutionSheet from "./QuestionSolutionSheet";
import HotspotLinkEditor from "./HotspotLinkEditor";
import Dialog from "../../shared/ui/Dialog";
import { entrySolutionQuestions, validSolutionHotspot } from "./solutionModel";
import "./OriginalPageStudyView.css";

interface Props {
  entry: WrongAnswerEntry;
  hidden: boolean;
  currentQuestionKey?: string;
  onCurrentQuestionChange?(key: string): void;
  onSaveHotspots?(hotspots: QuestionSolutionHotspot[]): Promise<void>;
}

export default function OriginalPageStudyView({ entry, hidden, currentQuestionKey, onCurrentQuestionChange, onSaveHotspots }: Props) {
  const returnFocusRegionRef = useRef<HTMLDivElement>(null);
  const pages = entry.sourcePageImages ?? [];
  const questions = useMemo(() => entrySolutionQuestions(entry), [entry]);
  const [currentPage, setCurrentPage] = useState(pages[0]);
  const [selectedPages, setSelectedPages] = useState(pages);
  const [solutionKey, setSolutionKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState("");
  const hotspots = useMemo(() => (entry.questionSolutionHotspots ?? []).filter(hotspot => validSolutionHotspot(hotspot) && questions.filter(question => question.key === hotspot.questionKey).length === 1), [entry.questionSolutionHotspots, questions]);
  const linkedPages = (key: string) => {
    const question = questions.find(question => question.key === key);
    const sourcePage = question?.page && Number.isInteger(question.page) ? pages[question.page - 1] : undefined;
    return pages.filter(page => page === sourcePage || hotspots.some(hotspot => hotspot.questionKey === key && hotspot.sourcePageImage === page));
  };
  // Only an explicit question selection moves the page. Page changes below
  // choose a confirmed linked question before updating the parent's context.
  const previousKey = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (previousKey.current === currentQuestionKey) return;
    previousKey.current = currentQuestionKey;
    if (!currentQuestionKey) return;
    const question = questions.find(question => question.key === currentQuestionKey);
    const sourcePage = question?.page && Number.isInteger(question.page) ? pages[question.page - 1] : undefined;
    const linked = selectedPages.filter(page => page === sourcePage || hotspots.some(hotspot => hotspot.questionKey === currentQuestionKey && hotspot.sourcePageImage === page));
    if (linked.includes(currentPage)) { setNotice(""); return; }
    if (linked[0]) { setCurrentPage(linked[0]); setNotice(""); }
    else setNotice("선택한 문항의 원본 페이지 연결이 없습니다. 현재 페이지를 유지합니다.");
  }, [currentQuestionKey, currentPage, hotspots, pages, questions, selectedPages]);
  const changePage = (page: string) => {
    setCurrentPage(page);
    const linked = questions.filter(question => questions.filter(other => other.key === question.key).length === 1 && linkedPages(question.key).includes(page));
    const target = linked.find(question => question.key === currentQuestionKey) ?? linked[0];
    if (target) {
      onCurrentQuestionChange?.(target.key);
      setNotice("");
    } else setNotice("이 페이지와 연결된 문항이 없습니다. 아래 현재 문항을 직접 선택하세요.");
  };
  const navigate = (key: string) => {
    setSolutionKey(key);
    onCurrentQuestionChange?.(key);
    const page = linkedPages(key).find(page => selectedPages.includes(page));
    if (page) { setCurrentPage(page); setNotice(""); }
    else setNotice("이 문항의 선택된 원본 페이지 연결이 없습니다. 현재 페이지를 유지합니다.");
  };
  return <div ref={returnFocusRegionRef} className="original-page-study">
    <div className="original-page-study__tools">
      <label>현재 문항 <select aria-label="학습할 현재 문항" value={currentQuestionKey ?? ""} onChange={event => onCurrentQuestionChange?.(event.target.value)}>
        {!currentQuestionKey && <option value="">문항 선택</option>}
        {questions.map((question, index) => <option key={question.key + index} value={question.key} disabled={questions.filter(other => other.key === question.key).length !== 1}>{question.number}번{question.section ? " · " + question.section : ""}</option>)}
      </select></label>
      <button type="button" className="btn-secondary" onClick={() => setInfoOpen(true)}>자료 정보</button>
      {onSaveHotspots && <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>파란 점·해설 연결 편집</button>}
    </div>
    {(notice || !hotspots.length) && <p className="original-page-study__notice" role="status">{notice || "파란 점과 문항의 연결을 확인하면 원본 문제지에서 정답·해설을 열 수 있습니다."}</p>}
    <div className="original-page-study__reader">
      <OriginalPageExamReader filenames={pages} selectedFilenames={selectedPages} currentFilename={currentPage} onSelectPages={next => {
        setSelectedPages(next);
        if (!next.includes(currentPage)) {
          const replacement = currentQuestionKey ? linkedPages(currentQuestionKey).find(page => next.includes(page)) : undefined;
          if (replacement) setCurrentPage(replacement);
          else if (next[0]) changePage(next[0]);
          else setCurrentPage("");
        }
      }} onChangePage={changePage} hotspots={hotspots} questionLabels={Object.fromEntries(questions.map(question => [question.key, question.number]))} onOpenSolution={navigate} />
    </div>
    <Dialog open={infoOpen} onClose={() => setInfoOpen(false)} title="자료 정보" size="lg" footer={<button type="button" onClick={() => setInfoOpen(false)}>닫기</button>}>
      <h3>{entry.title}</h3><p>{entry.subject} · {questions.length}문항 · 원본 {pages.length}페이지</p>
      {entry.tags.length > 0 && <p>{entry.tags.map(tag => "#" + tag).join(" ")}</p>}
      {entry.memo && <p className="math-prose">{entry.memo}</p>}
      <p>문항별 보기에서 학습 내용과 전체 답안·메모를 볼 수 있습니다.</p>
    </Dialog>
    {solutionKey && <QuestionSolutionSheet returnFocusRegionRef={returnFocusRegionRef} questions={questions} questionKey={solutionKey} hidden={hidden && !revealed.has(solutionKey)} onReveal={() => setRevealed(current => new Set(current).add(solutionKey))} onNavigate={navigate} onClose={() => setSolutionKey(null)} pageNotice={notice} />}
    {editing && onSaveHotspots && <HotspotLinkEditor pages={pages} questions={questions} hotspots={hotspots} onSave={onSaveHotspots} onClose={() => setEditing(false)} />}
  </div>;
}
