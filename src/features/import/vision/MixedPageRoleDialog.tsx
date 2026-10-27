import "./mixedPageRoles.css";
import { useEffect, useMemo, useState } from "react";
import Dialog from "../../../shared/ui/Dialog";

export type PageRoleSelection = {
  sourceKey: string;
  page: number;
  role: "problem" | "answer" | "mixed" | "exclude";
};

export type PageRoleSource = {
  sourceKey: string;
  name?: string;
  pages: File[];
};

type Preview = { url?: string; error?: string };

const ROLE_LABELS: Record<PageRoleSelection["role"], string> = {
  problem: "문제",
  answer: "정답",
  mixed: "문제 + 정답 혼합",
  exclude: "제외",
};

const roleStyle = { fontSize: 14, minHeight: 36, maxWidth: "100%" } as const;
const pageKey = (sourceKey: string, page: number) => `${sourceKey}\u0000${page}`;

export interface MixedPageRoleDialogProps {
  sources: PageRoleSource[];
  onConfirm: (roles: PageRoleSelection[]) => void;
  onCancel: () => void;
}

export default function MixedPageRoleDialog({ sources, onConfirm, onCancel }: MixedPageRoleDialogProps) {
  const [roles, setRoles] = useState<Record<string, PageRoleSelection["role"]>>({});
  const [rangeSource, setRangeSource] = useState(sources[0]?.sourceKey ?? "");
  const [rangeStart, setRangeStart] = useState("1");
  const [rangeEnd, setRangeEnd] = useState(String(sources[0]?.pages.length ?? 1));
  const [rangeRole, setRangeRole] = useState<PageRoleSelection["role"]>("problem");
  const [rangeMessage, setRangeMessage] = useState("");
  const [previews, setPreviews] = useState<Record<string, Preview>>({});

  const allPages = useMemo(() => sources.flatMap(source => source.pages.map((file, index) => ({
    sourceKey: source.sourceKey,
    page: index + 1,
    file,
    key: pageKey(source.sourceKey, index + 1),
  }))), [sources]);

  useEffect(() => {
    let active = true;
    const next: Record<string, Preview> = {};
    const created: string[] = [];
    for (const item of allPages) {
      try {
        const url = URL.createObjectURL(item.file);
        created.push(url);
        next[item.key] = { url };
      } catch {
        next[item.key] = { error: "이 페이지의 미리보기를 불러오지 못했습니다." };
      }
    }
    if (active) setPreviews(next);
    return () => {
      active = false;
      created.forEach(url => URL.revokeObjectURL(url));
    };
  }, [allPages]);

  useEffect(() => {
    if (sources.some(source => source.sourceKey === rangeSource)) return;
    const first = sources[0];
    setRangeSource(first?.sourceKey ?? "");
    setRangeStart("1");
    setRangeEnd(String(first?.pages.length ?? 1));
  }, [rangeSource, sources]);

  const counts = allPages.reduce((acc, item) => {
    const role = roles[item.key] ?? "mixed";
    acc[role] += 1;
    return acc;
  }, { problem: 0, answer: 0, mixed: 0, exclude: 0 });
  const canConfirm = counts.problem + counts.mixed > 0;

  const applyRange = () => {
    const source = sources.find(item => item.sourceKey === rangeSource);
    const start = Number(rangeStart);
    const end = Number(rangeEnd);
    if (!source || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > source.pages.length) {
      setRangeMessage("시작과 끝은 1부터 해당 파일의 페이지 수까지의 정수 범위로 입력해 주세요.");
      return;
    }
    setRoles(current => {
      const next = { ...current };
      for (let page = start; page <= end; page += 1) next[pageKey(source.sourceKey, page)] = rangeRole;
      return next;
    });
    setRangeMessage(`${source.sourceKey} ${start}–${end}페이지에 적용했습니다.`);
  };

  const confirm = () => {
    if (!canConfirm) return;
    onConfirm(allPages.map(({ sourceKey, page, key }) => ({ sourceKey, page, role: roles[key] ?? "mixed" })));
  };

  const selectRole = (sourceKey: string, page: number, value: string) => {
    setRoles(current => ({ ...current, [pageKey(sourceKey, page)]: value as PageRoleSelection["role"] }));
  };

  return (
    <>

      <Dialog
        open
        onClose={onCancel}
        title="페이지 역할 확인"
        size="xl"
        scrollMode="custom"
        className="mixed-page-dialog"
        bodyClassName="mixed-page-dialog__body"
        closeOnBackdrop={false}
        header={<p style={{ margin: "4px 0 0", fontSize: 13 }}>혼합 PDF의 페이지를 확인해 주세요. 검토 전에는 모든 페이지가 혼합으로 표시됩니다.</p>}
        footer={(
          <div className="mixed-page-dialog__footer">
            <button type="button" className="ui-button ui-button--secondary" onClick={onCancel}>취소</button>
            <button type="button" className="ui-button ui-button--primary" onClick={confirm} disabled={!canConfirm}>역할 확인</button>
          </div>
        )}
      >
        <p className="mixed-page-dialog__intro">분리된 문제 페이지를 먼저 풀이에 전달합니다. 혼합 페이지가 남으면 독립 풀이 여부는 미확인으로 기록합니다. 답안 페이지만으로는 분석을 시작할 수 없습니다.</p>
        <section className="mixed-page-dialog__batch" aria-label="페이지 범위 일괄 적용">
          <label className="mixed-page-dialog__field">
            파일
            <select aria-label="일괄 적용 파일" value={rangeSource} onChange={event => { setRangeSource(event.target.value); setRangeStart("1"); setRangeEnd(String(sources.find(source => source.sourceKey === event.target.value)?.pages.length ?? 1)); setRangeMessage(""); }}>
              {sources.map(source => <option key={source.sourceKey} value={source.sourceKey}>{source.name ?? source.sourceKey}</option>)}
            </select>
          </label>
          <label className="mixed-page-dialog__field">시작 페이지<input className="mixed-page-dialog__range-input" aria-label="시작 페이지" type="number" min={1} step={1} value={rangeStart} onChange={event => setRangeStart(event.target.value)} /></label>
          <label className="mixed-page-dialog__field">끝 페이지<input className="mixed-page-dialog__range-input" aria-label="끝 페이지" type="number" min={1} step={1} value={rangeEnd} onChange={event => setRangeEnd(event.target.value)} /></label>
          <label className="mixed-page-dialog__field">역할<select aria-label="일괄 적용 역할" value={rangeRole} onChange={event => setRangeRole(event.target.value as PageRoleSelection["role"])}>{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <button type="button" className="ui-button ui-button--secondary" onClick={applyRange}>범위 적용</button>
        </section>
        <p className="mixed-page-dialog__message" role="status">{rangeMessage}</p>
        <div className="mixed-page-dialog__grid">
          {allPages.map(({ sourceKey, page, key }) => {
            const preview = previews[key];
            const label = `${sources.find(source => source.sourceKey === sourceKey)?.name ?? sourceKey} 물리 페이지 ${page}`;
            return <article className="mixed-page-dialog__card" key={key}>
              <h3 className="mixed-page-dialog__title">{label}</h3>
              <div className="mixed-page-dialog__thumb">
                {preview?.url ? <img src={preview.url} alt={`${label} 미리보기`} onError={() => setPreviews(current => ({ ...current, [key]: { error: "이 페이지의 미리보기를 표시할 수 없습니다." } }))} /> : <span className="mixed-page-dialog__error" role={preview?.error ? "status" : undefined}>{preview?.error ?? "미리보기 준비 중"}</span>}
              </div>
              <label className="mixed-page-dialog__field">
                페이지 역할
                <select style={roleStyle} aria-label={`${label} 역할`} value={roles[key] ?? "mixed"} onChange={event => selectRole(sourceKey, page, event.target.value)}>
                  {Object.entries(ROLE_LABELS).map(([value, roleLabel]) => <option key={value} value={value}>{roleLabel}</option>)}
                </select>
              </label>
            </article>;
          })}
        </div>
        <div className="mixed-page-dialog__counts" aria-label="페이지 역할 개수">
          <span>문제 {counts.problem}</span><span>정답 {counts.answer}</span><span>혼합 {counts.mixed}</span><span>제외 {counts.exclude}</span>
        </div>
      </Dialog>
    </>
  );
}
