import { useState } from "react";
import type { EntryKind, EntryTemplate, PromptTemplate } from "../../types";

type TemplateDraft = { kind: "entry" | "prompt" | "memo"; id?: string; name: string; content: string };

interface SettingsTemplatesPanelProps {
  templates: EntryTemplate[];
  promptTemplates: PromptTemplate[];
  memoTemplates: Array<{ id: string; name: string; content: string; builtIn?: boolean }>;
  saveTemplate(template: EntryTemplate): Promise<void>;
  deleteTemplate(id: string): void;
  savePromptTemplate(template: { id: string; name: string; content: string }): Promise<void>;
  deletePromptTemplate(id: string): void;
  saveMemoTemplate(template: { id: string; name: string; content: string }): Promise<void>;
  deleteMemoTemplate(id: string): void;
  onError(message: string): void;
}

export default function SettingsTemplatesPanel(props: SettingsTemplatesPanelProps) {
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const { templates, promptTemplates, memoTemplates } = props;
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) return;
    const name = draft.name.trim();
    const content = draft.content.trim();
    if (!name || !content) return;
    try {
      if (draft.kind === "prompt") await props.savePromptTemplate({ id: draft.id ?? crypto.randomUUID(), name, content });
      else if (draft.kind === "entry") {
        const data = JSON.parse(content) as EntryTemplate["data"];
        const entryKind: EntryKind = data.entryKind === "concept" || data.entryKind === "problem_sheet" || data.entryKind === "lecture" ? data.entryKind : "wrong_answer";
        await props.saveTemplate({ id: draft.id ?? crypto.randomUUID(), name, entryKind, data });
      } else await props.saveMemoTemplate({ id: draft.id ?? crypto.randomUUID(), name, content });
      setDraft(null);
    } catch (error) {
      props.onError(error instanceof Error ? error.message : "템플릿 저장에 실패했습니다.");
    }
  };
  return <div className="settings-pref-panel">
    <p className="settings-label">입력 템플릿</p>
    <TemplateList empty="저장된 템플릿이 없습니다." items={templates.map((template) => ({ id: template.id, name: template.name, builtIn: false, onDelete: () => props.deleteTemplate(template.id), onEdit: () => setDraft({ kind: "entry", id: template.id, name: template.name, content: JSON.stringify(template.data, null, 2) }) }))} />
    <p className="settings-label">GPT 프롬프트 템플릿</p>
    <TemplateList items={promptTemplates.map((template) => ({ id: template.id, name: template.name, builtIn: template.builtIn, onDelete: () => props.deletePromptTemplate(template.id), onEdit: () => setDraft({ kind: "prompt", id: template.id, name: template.name, content: template.content }), onCopy: () => setDraft({ kind: "prompt", name: `${template.name} 복사본`, content: template.content }) }))} />
    <p className="settings-label">메모 템플릿</p>
    <button type="button" className="theme-btn" onClick={() => setDraft({ kind: "memo", name: "", content: "" })}>메모 템플릿 추가</button>
    <TemplateList items={memoTemplates.map((template) => ({ id: template.id, name: template.name, builtIn: template.builtIn, onDelete: () => props.deleteMemoTemplate(template.id), onEdit: () => setDraft({ kind: "memo", id: template.id, name: template.name, content: template.content }), onCopy: () => setDraft({ kind: "memo", name: `${template.name} 복사본`, content: template.content }) }))} />
    {draft && <form className="template-edit-form" onSubmit={(event) => void submit(event)}>
      <label>이름<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>내용<textarea value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} /></label>
      <div className="settings-actions"><button type="submit" className="theme-btn">저장</button><button type="button" className="theme-btn" onClick={() => setDraft(null)}>취소</button></div>
    </form>}
  </div>;
}

function TemplateList({ items, empty = "템플릿이 없습니다." }: { items: Array<{ id: string; name: string; builtIn?: boolean; onDelete: () => void; onEdit?: () => void; onCopy?: () => void }>; empty?: string }) {
  if (items.length === 0) return <span className="template-empty">{empty}</span>;
  return <div className="template-list">{items.map((item) => <div key={item.id} className="template-item"><span>{item.name}{item.builtIn ? " · 기본" : ""}</span>{!item.builtIn && <><button type="button" onClick={item.onEdit}>편집</button><button type="button" onClick={item.onDelete}>삭제</button></>}{item.builtIn && item.onCopy && <button type="button" onClick={item.onCopy}>복사</button>}</div>)}</div>;
}
