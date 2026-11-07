import { useEffect, useRef, useState } from "react";
export default function RemoteMcpUrlField({ value, save }: { value: string; save(value: string): Promise<void> }) {
  const [text, setText] = useState(value);
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  const queuedText = useRef(value);
  const writes = useRef(Promise.resolve());
  const version = useRef(0);
  const request = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    const generation = request;
    mounted.current = true;
    return () => { mounted.current = false; generation.current++; };
  }, []);
  const commit = async () => {
    const id = ++request.current;
    const revision = version.current;
    const input = text;
    queuedText.current = input;
    setFailed(false);
    setNotice("저장 중…");
    const write = writes.current.then(() => save(input));
    writes.current = write.catch(() => undefined);
    try { await write; if (mounted.current && request.current === id && version.current === revision) setNotice("저장했습니다."); }
    catch (error) { if (mounted.current && request.current === id && version.current === revision) { setFailed(true); setNotice(error instanceof Error ? error.message : "저장하지 못했습니다."); } }
  };
  return <div>
    <label className="form-field">
      <span>외부 HTTPS MCP 기본 URL</span>
      <input value={text} placeholder="https://example-tunnel-domain"
        onChange={event => {
          version.current++;
          setText(event.target.value);
          setNotice("");
          setFailed(false);
        }}
        onBlur={() => { if (text !== queuedText.current) void commit(); }} />
      <small>자동 터널을 사용할 수 없는 환경에서는 외부에서 만든 HTTPS 기본 URL을 등록하세요.</small>
    </label>
    <p role={failed ? "alert" : "status"}>{notice}</p>
    {failed && <button type="button" className="btn-secondary" onClick={() => void commit()}>저장 재시도</button>}
  </div>;
}
