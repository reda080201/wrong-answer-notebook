import { useState } from "react";
import { createRoot } from "react-dom/client";
import { LinkifiedText, renderWikiLinksInNodes } from "../../src/utils/wikiLinks";
import "../../src/index.css";
import "../../src/App.css";

function Harness() {
  const [calls, setCalls] = useState(0), [parents, setParents] = useState(0), [submits, setSubmits] = useState(0);
  const activate = () => setCalls(n => n + 1);
  return <form onSubmit={e => { e.preventDefault(); setSubmits(n => n + 1); }}><div onClick={() => setParents(n => n + 1)} onKeyDown={() => setParents(n => n + 1)}>
    <p>수식과 링크: <LinkifiedText text={String.raw`$\frac{1}{2}$ [[Algebra|대수]]`} existingTargets={new Set(["algebra"])} onLinkClick={activate} /></p>
    <p>{renderWikiLinksInNodes([<mark key="m">[[Geometry|기하]]</mark>], activate, new Set())}</p>
  </div><output aria-label="activation counts">{calls}/{parents}/{submits}</output></form>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
