import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { QuestionSolutionHotspot } from "../../types";
import { getImageUrl } from "../../api";
import Dialog from "../../shared/ui/Dialog";
import { detectBlueDotPositions, type SolutionQuestion } from "./solutionModel";
import "./solutions.css";

export interface HotspotCandidate extends QuestionSolutionHotspot { confirmed: boolean; }
interface Props {
  pages: string[];
  loadPageUrl?(filename: string): Promise<string>;
  questions: SolutionQuestion[];
  hotspots: QuestionSolutionHotspot[];
  initialCandidates?: HotspotCandidate[];
  onCandidatesChange?(candidates: HotspotCandidate[]): void;
  onSave(hotspots: QuestionSolutionHotspot[]): Promise<void> | void;
  onClose(): void;
}

export default function HotspotLinkEditor({ pages, loadPageUrl, questions, hotspots, initialCandidates, onCandidatesChange, onSave, onClose }: Props) {
  const [page, setPage] = useState(pages[0] ?? "");
  const [imageState, setImageState] = useState({ page: "", url: "", error: "" });
  const url = imageState.page === page ? imageState.url : "";
  const imageError = imageState.page === page ? imageState.error : "";
  const [candidates, setCandidates] = useState<HotspotCandidate[]>(() => initialCandidates ?? hotspots.map(hotspot => ({ ...hotspot, confirmed: true })));
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const imageRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const detectedPagesRef = useRef(new Set<string>());
  const dragRef = useRef<string | null>(null);
  const uniqueQuestions = questions.filter(question => questions.filter(other => other.key === question.key).length === 1);
  const change = (next: HotspotCandidate[]) => { setCandidates(next); onCandidatesChange?.(next); };
  useEffect(() => {
    let active = true;
    let ownedUrl = "";
    if (page) void (loadPageUrl ?? getImageUrl)(page).then(value => { if (loadPageUrl && value.startsWith("blob:")) ownedUrl = value; if (active) setImageState({ page, url: value, error: "" }); else if (ownedUrl) URL.revokeObjectURL(ownedUrl); }).catch(cause => { if (active) setImageState({ page, url: "", error: cause instanceof Error ? cause.message : "원본 페이지를 읽지 못했습니다." }); });
    return () => { active = false; if (ownedUrl) URL.revokeObjectURL(ownedUrl); };
  }, [page, loadPageUrl]);
  const atPointer = (event: PointerEvent) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return null;
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  };
  const update = (id: string, patch: Partial<HotspotCandidate>) => change(candidates.map(candidate => candidate.id === id ? { ...candidate, ...patch } : candidate));
  const detect = () => {
    const image = imageRef.current;
    if (!image?.complete || !image.naturalWidth) { setError("페이지 이미지가 표시된 뒤 다시 시도해 주세요."); return; }
    try {
      setError(null);
      const positions = detectBlueDotPositions(image);
      const pageQuestions = uniqueQuestions.filter(question => question.page === pages.indexOf(page) + 1);
      const added = positions.filter(position => !candidates.some(candidate => candidate.sourcePageImage === page && Math.hypot(candidate.x - position.x, candidate.y - position.y) < .008));
      change([...candidates, ...added.map(position => ({ id: crypto.randomUUID(), sourcePageImage: page, questionKey: pageQuestions.length === positions.length ? pageQuestions[positions.indexOf(position)]?.key ?? "" : "", ...position, confirmed: false }))]);
      setNotice(`파란 점 ${positions.length}개를 찾았습니다. 각 점의 문항을 선택하고 연결 확인을 체크하세요.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "점 후보를 찾지 못했습니다. 페이지를 눌러 직접 추가할 수 있습니다."); }
  };
  const save = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(null);
    try {
      const confirmed = candidates.filter(candidate => candidate.confirmed);
      if (confirmed.some(candidate => !uniqueQuestions.some(question => question.key === candidate.questionKey))) throw new Error("확인된 점의 문항 연결을 다시 확인하세요.");
      await onSave(confirmed.map(({ id, sourcePageImage, questionKey, x, y }) => ({ id, sourcePageImage, questionKey, x, y })));
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "연결을 저장하지 못했습니다."); }
    finally { busyRef.current = false; setBusy(false); }
  };
  return <Dialog open onClose={onClose} title="파란 점과 정답·해설 연결" size="xl" closeDisabled={busy} busy={busy}>
    <div className="solution-link-editor">
      <p>파란 점을 찾은 뒤 문항을 선택하고 연결을 확인하세요. 페이지를 누르면 점을 추가하고, 점을 끌면 위치를 옮깁니다.</p>
      <div className="solution-link-editor-toolbar"><label>원본 페이지 <select value={page} disabled={busy} onChange={event => { setError(null); setNotice(""); setPage(event.target.value); }}>{pages.map((filename, index) => <option value={filename} key={filename}>{index + 1}페이지</option>)}</select></label><button type="button" onClick={detect} disabled={busy || !url}>이 페이지 파란 점 찾기</button></div>
      {notice && <p role="status">{notice}</p>}{(error || imageError) && <p role="alert">{error || imageError}</p>}
      {!pages.length && <p>원본 페이지를 먼저 연결해 주세요.</p>}
      {uniqueQuestions.length < questions.length && <p role="alert">번호와 구분이 같은 문항은 연결할 수 없습니다. 문항 번호·구분을 먼저 수정해 주세요.</p>}
      <div className="solution-link-editor-body"><div className="solution-link-editor-page"><div ref={stageRef} className="solution-hotspot-stage" onPointerDown={event => {
        if (busy || event.target !== imageRef.current || !imageRef.current?.naturalWidth) return;
        const position = atPointer(event); if (!position) return;
        const id = crypto.randomUUID(); change([...candidates, { id, sourcePageImage: page, questionKey: "", ...position, confirmed: false }]); setSelected(id);
      }}>{url && <img ref={imageRef} src={url} alt="점 위치를 지정할 원본 문제지" draggable={false} onLoad={() => { if (!detectedPagesRef.current.has(page)) { detectedPagesRef.current.add(page); if (!candidates.some(candidate => candidate.sourcePageImage === page)) detect(); } }} onError={() => { setImageState({ page, url: "", error: "원본 페이지를 불러오지 못했습니다." }); }} />}
      {candidates.filter(candidate => candidate.sourcePageImage === page).map(candidate => <button type="button" key={candidate.id} className="solution-link-editor-marker" style={{ left: `${candidate.x * 100}%`, top: `${candidate.y * 100}%` }} aria-label={`연결 위치 ${candidates.indexOf(candidate) + 1}`} aria-pressed={selected === candidate.id} disabled={busy} onPointerDown={event => { event.stopPropagation(); setSelected(candidate.id); dragRef.current = candidate.id; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (dragRef.current !== candidate.id) return; const position = atPointer(event); if (position) update(candidate.id, { ...position, confirmed: false }); }} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}>{candidates.indexOf(candidate) + 1}</button>)}</div></div>
      <div className="solution-link-editor-list">{candidates.filter(candidate => candidate.sourcePageImage === page).map(candidate => <div className="solution-link-editor-item" key={candidate.id}>
        <strong>점 {candidates.indexOf(candidate) + 1}</strong><label>연결할 문항 <select disabled={busy} value={candidate.questionKey} onChange={event => update(candidate.id, { questionKey: event.target.value, confirmed: false })}><option value="">문항 선택</option>{uniqueQuestions.map(question => <option key={question.key} value={question.key}>{question.number}번{question.section ? ` · ${question.section}` : ""}{question.page ? ` · 원본 ${question.page}페이지` : ""}</option>)}</select></label>
        <label><input type="checkbox" checked={candidate.confirmed} disabled={busy || !candidate.questionKey} onChange={event => update(candidate.id, { confirmed: event.target.checked })} />이 위치와 문항의 연결 확인</label>
        <button type="button" disabled={busy} onClick={() => change(candidates.filter(item => item.id !== candidate.id))}>점 삭제</button>
      </div>)}</div></div>
      <footer><button type="button" onClick={onClose} disabled={busy}>취소</button><button type="button" onClick={() => void save()} disabled={busy}>{busy ? "저장 중…" : "확인한 연결 저장"}</button></footer>
    </div>
  </Dialog>;
}
