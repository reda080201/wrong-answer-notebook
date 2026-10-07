import { useMemo, useState } from "react";
import type { QuestionSolutionHotspot, WrongAnswerEntry } from "../../types";
import OriginalPageExamReader from "../exam/components/OriginalPageExamReader";
import QuestionSolutionSheet from "./QuestionSolutionSheet";
import HotspotLinkEditor from "./HotspotLinkEditor";
import { entrySolutionQuestions, validSolutionHotspot } from "./solutionModel";

interface Props {
  entry: WrongAnswerEntry;
  hidden: boolean;
  onSaveHotspots?(hotspots: QuestionSolutionHotspot[]): Promise<void>;
}

export default function OriginalPageStudyView({ entry, hidden, onSaveHotspots }: Props) {
  const pages = entry.sourcePageImages ?? [];
  const questions = useMemo(() => entrySolutionQuestions(entry), [entry]);
  const [currentPage, setCurrentPage] = useState(pages[0]);
  const [selectedPages, setSelectedPages] = useState(pages);
  const [solutionKey, setSolutionKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState("");
  const hotspots = (entry.questionSolutionHotspots ?? []).filter(hotspot => validSolutionHotspot(hotspot) && questions.filter(question => question.key === hotspot.questionKey).length === 1);
  const navigate = (key: string) => {
    setSolutionKey(key);
    const page = hotspots.find(hotspot => hotspot.questionKey === key && selectedPages.includes(hotspot.sourcePageImage))?.sourcePageImage;
    if (page) { setCurrentPage(page); setNotice(""); }
    else setNotice("이 문항의 선택된 원본 페이지 연결이 없습니다. 현재 페이지를 유지합니다.");
  };
  return <div>
    {onSaveHotspots && <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>파란 점·해설 연결 편집</button>}
    {!hotspots.length && <p role="status">파란 점과 문항의 연결을 확인하면 원본 문제지에서 정답·해설을 열 수 있습니다.</p>}
    <OriginalPageExamReader filenames={pages} selectedFilenames={selectedPages} currentFilename={currentPage} onSelectPages={setSelectedPages} onChangePage={setCurrentPage} hotspots={hotspots} questionLabels={Object.fromEntries(questions.map(question => [question.key, question.number]))} onOpenSolution={navigate} />
    {solutionKey && <QuestionSolutionSheet questions={questions} questionKey={solutionKey} hidden={hidden && !revealed.has(solutionKey)} onReveal={() => setRevealed(current => new Set(current).add(solutionKey))} onNavigate={navigate} onClose={() => setSolutionKey(null)} pageNotice={notice} />}
    {editing && onSaveHotspots && <HotspotLinkEditor pages={pages} questions={questions} hotspots={hotspots} onSave={onSaveHotspots} onClose={() => setEditing(false)} />}
  </div>;
}
