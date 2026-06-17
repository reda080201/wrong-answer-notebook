import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { EntryFormData, EntryKind, EntryTemplate, MemoTemplate, WrongAnswerEntry } from "../types";
import { hasEntryContent } from "../utils/entry";
import { cleanQuestionText } from "../utils/textCleanup";
import { SUBJECTS } from "../types";
import ImageField from "./ImageField";

interface EntryFormProps {
  entry?: WrongAnswerEntry;
  onSave: (data: EntryFormData, removedImages: string[]) => Promise<void>;
  onClose: () => void;
  defaultEntryKind?: EntryKind;
  prefilledTitle?: string;
  initialData?: Partial<EntryFormData>;
  templates?: EntryTemplate[];
  memoTemplates?: MemoTemplate[];
  onSaveTemplate?: (template: EntryTemplate) => Promise<void>;
}

const emptyPart = () => ({
  id: uuidv4(),
  text: "",
  images: [] as string[],
});

const emptyForm: EntryFormData = {
  subject: "수학",
  title: "",
  question: "",
  questionImages: [],
  entryKind: "wrong_answer",
  difficult: false,
  difficulty: "none",
  annotations: [],
  myAnswer: "",
  correctAnswer: "",
  explanationParts: [emptyPart()],
  memo: "",
  tags: [],
  answerKey: [],
  figures: [],
  mastered: false,
};

function cloneFormFromEntry(entry: WrongAnswerEntry): EntryFormData {
  return {
    subject: entry.subject,
    title: entry.title,
    question: entry.question,
    questionImages: [...entry.questionImages],
    entryKind: entry.entryKind,
    difficult: entry.difficult,
    difficulty: entry.difficulty ?? "none",
    annotations: [...(entry.annotations ?? [])],
    myAnswer: entry.myAnswer,
    correctAnswer: entry.correctAnswer,
    explanationParts:
      entry.explanationParts.length > 0
        ? entry.explanationParts.map((p) => ({
            id: p.id,
            text: p.text,
            images: [...p.images],
          }))
        : [emptyPart()],
    memo: entry.memo,
    tags: entry.tags,
    answerKey: (entry.answerKey ?? []).map((item) => ({
      ...item,
      importantPoints: [...item.importantPoints],
      concepts: item.concepts ? [...item.concepts] : [],
    })),
    figures: (entry.figures ?? []).map((figure) => ({ ...figure })),
    mastered: entry.mastered,
    review: entry.review,
    checklist: entry.checklist ? entry.checklist.map((item) => ({ ...item })) : [],
  };
}

function cloneInitialForm(data: Partial<EntryFormData>): EntryFormData {
  return {
    ...emptyForm,
    ...data,
    questionImages: data.questionImages ? [...data.questionImages] : [],
    explanationParts: data.explanationParts
      ? data.explanationParts.map((part) => ({
          ...part,
          images: [...part.images],
        }))
      : [emptyPart()],
    annotations: data.annotations ? [...data.annotations] : [],
    tags: data.tags ? [...data.tags] : [],
    answerKey: data.answerKey
      ? data.answerKey.map((item) => ({
          ...item,
          importantPoints: [...item.importantPoints],
          concepts: item.concepts ? [...item.concepts] : [],
        }))
      : [],
    figures: data.figures ? data.figures.map((figure) => ({ ...figure })) : [],
    checklist: data.checklist ? data.checklist.map((item) => ({ ...item })) : [],
  };
}

function entryHadQuestionImage(e: WrongAnswerEntry | undefined, f: string) {
  return e?.questionImages.includes(f) ?? false;
}

function entryHadExplanationImage(e: WrongAnswerEntry | undefined, f: string) {
  if (!e) return false;
  return (
    e.explanationParts.some((p) => p.images.includes(f)) ||
    (e.explanationImages?.includes(f) ?? false)
  );
}

export default function EntryForm({
  entry,
  onSave,
  onClose,
  defaultEntryKind,
  prefilledTitle,
  initialData,
  templates = [],
  memoTemplates = [],
  onSaveTemplate,
}: EntryFormProps) {
  const [form, setForm] = useState<EntryFormData>(emptyForm);
  const [tagInput, setTagInput] = useState("");
  const [removedImages, setRemovedImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (entry) {
      setForm(cloneFormFromEntry(entry));
      setRemovedImages([]);
      setSaveError(null);
    } else {
      setForm(cloneInitialForm({
        ...initialData,
        entryKind: initialData?.entryKind ?? defaultEntryKind ?? "wrong_answer",
        title: initialData?.title ?? prefilledTitle ?? "",
        difficulty: initialData?.difficulty ?? "none",
        explanationParts: initialData?.explanationParts ?? [emptyPart()],
      }));
      setRemovedImages([]);
      setSaveError(null);
    }
  }, [entry, defaultEntryKind, prefilledTitle, initialData]);

  const trackRemove = (filename: string, wasPersisted: boolean) => {
    if (wasPersisted) setRemovedImages((prev) => [...prev, filename]);
  };

  const removeQuestionImage = (filename: string) => {
    setForm((f) => ({
      ...f,
      questionImages: f.questionImages.filter((x) => x !== filename),
    }));
    trackRemove(filename, entryHadQuestionImage(entry, filename));
  };

  const updateExplanationPart = (
    index: number,
    patch: Partial<(typeof form.explanationParts)[0]>,
  ) => {
    setForm((f) => ({
      ...f,
      explanationParts: f.explanationParts.map((p, i) =>
        i === index ? { ...p, ...patch } : p,
      ),
    }));
  };

  const setPartImages = (index: number, images: string[]) => {
    setForm((f) => ({
      ...f,
      explanationParts: f.explanationParts.map((p, i) =>
        i === index ? { ...p, images } : p,
      ),
    }));
  };

  const removeExplanationImage = (partIndex: number, filename: string) => {
    const part = form.explanationParts[partIndex];
    setPartImages(
      partIndex,
      part.images.filter((x) => x !== filename),
    );
    trackRemove(filename, entryHadExplanationImage(entry, filename));
  };

  const addExplanationPart = () => {
    setForm((f) => ({
      ...f,
      explanationParts: [...f.explanationParts, emptyPart()],
    }));
  };

  const removeExplanationPart = (index: number) => {
    if (form.explanationParts.length <= 1) return;
    const part = form.explanationParts[index];
    for (const img of part.images) {
      trackRemove(img, entryHadExplanationImage(entry, img));
    }
    setForm((f) => ({
      ...f,
      explanationParts: f.explanationParts.filter((_, i) => i !== index),
    }));
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      setForm((f) => ({ ...f, tags: [...f.tags, tag] }));
    }
    setTagInput("");
  };

  const addAnswerKeyItem = () => {
    setForm((current) => ({
      ...current,
      answerKey: [
        ...(current.answerKey ?? []),
        {
          id: uuidv4(),
          questionNumber: "",
          answer: "",
          explanation: "",
          notes: "",
          importantPoints: [],
          concepts: [],
        },
      ],
    }));
  };

  const updateAnswerKeyItem = (
    id: string,
    patch: Partial<NonNullable<EntryFormData["answerKey"]>[number]>,
  ) => {
    setForm((current) => ({
      ...current,
      answerKey: (current.answerKey ?? []).map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
  };

  const removeAnswerKeyItem = (id: string) => {
    setForm((current) => ({
      ...current,
      answerKey: (current.answerKey ?? []).filter((item) => item.id !== id),
    }));
  };

  const applyTemplate = (templateId: string) => {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setForm((current) => ({
      ...current,
      ...template.data,
      entryKind: template.entryKind,
      questionImages: template.data.questionImages
        ? [...template.data.questionImages]
        : current.questionImages,
      explanationParts: template.data.explanationParts
        ? template.data.explanationParts.map((part) => ({
            ...part,
            images: [...part.images],
          }))
        : current.explanationParts,
      tags: template.data.tags ? [...template.data.tags] : current.tags,
      figures: template.data.figures ? template.data.figures.map((figure) => ({ ...figure })) : current.figures,
      annotations: template.data.annotations ? [...template.data.annotations] : current.annotations,
    }));
  };

  const saveCurrentTemplate = async () => {
    if (!onSaveTemplate) return;
    const name = prompt("템플릿 이름을 입력하세요.");
    if (!name?.trim()) return;
    await onSaveTemplate({
      id: uuidv4(),
      name: name.trim(),
      entryKind: form.entryKind,
      data: {
        subject: form.subject,
        title: form.title,
        question: form.question,
        entryKind: form.entryKind,
        difficult: form.difficult,
        difficulty: form.difficulty,
        myAnswer: form.myAnswer,
        correctAnswer: form.correctAnswer,
        explanationParts: form.explanationParts,
        memo: form.memo,
        tags: form.tags,
        answerKey: form.answerKey,
        figures: form.figures,
        questionImages: [],
        annotations: [],
        mastered: false,
      },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasEntryContent(form)) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(form, removedImages);
      onClose();
    } catch (error) {
      setSaveError(
        error instanceof Error && error.message
          ? error.message
          : "저장 중 문제가 발생했습니다.",
      );
    } finally {
      setSaving(false);
    }
  };

  const formTitle = entry
    ? entry.entryKind === "problem_sheet"
      ? "문제지 수정"
      : entry.entryKind === "concept"
        ? "개념 수정"
        : "오답 수정"
    : form.entryKind === "problem_sheet"
      ? "문제지 추가"
      : form.entryKind === "concept"
        ? "개념 추가"
        : "오답 추가";

  return (
    <div className="form-overlay" onClick={onClose}>
      <div className="form-modal form-modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="form-header">
          <h2>{formTitle}</h2>
          <button type="button" className="btn-icon" onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-body">
            <div className="form-row form-row--3">
              <div className="form-field">
                <label htmlFor="entryKind">유형</label>
                <select
                  id="entryKind"
                  value={form.entryKind}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      entryKind: e.target.value as EntryKind,
                    }))
                  }
                >
                  <option value="wrong_answer">오답</option>
                  <option value="concept">개념</option>
                  <option value="problem_sheet">문제지 전체</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="subject">과목</label>
                <select
                  id="subject"
                  value={form.subject}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, subject: e.target.value }))
                  }
                >
                  {SUBJECTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>난이도</label>
                <div className="difficulty-selector">
                  {(
                    [
                      ["high", "상"],
                      ["medium", "중"],
                      ["low", "하"],
                      ["none", "없음"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`difficulty-btn difficulty-btn--${value} ${
                        (form.difficulty ?? "none") === value ? "active" : ""
                      }`}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          difficulty: value,
                          difficult: value === "high" || value === "medium",
                        }))
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="form-row form-row--template">
              <div className="form-field">
                <label htmlFor="template">템플릿</label>
                <select
                  id="template"
                  defaultValue=""
                  onChange={(event) => {
                    applyTemplate(event.target.value);
                    event.currentTarget.value = "";
                  }}
                >
                  <option value="">템플릿 선택</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field form-field--button">
                <label aria-hidden="true">&nbsp;</label>
                <button type="button" className="btn-secondary" onClick={saveCurrentTemplate}>
                  현재 내용 템플릿 저장
                </button>
              </div>
            </div>

            <div className="form-row">
              <div className="form-field checkbox-field">
                <label>
                  <input
                    type="checkbox"
                    checked={form.mastered}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, mastered: e.target.checked }))
                    }
                  />
                  복습 완료
                </label>
              </div>
            </div>

            <div className="form-field full">
              <label htmlFor="title">제목</label>
              <input
                id="title"
                type="text"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="목록에 표시될 제목"
              />
            </div>

            <div className="form-field full">
              <label htmlFor="question">
                {form.entryKind === "problem_sheet"
                  ? "문제지 · 지문 (텍스트)"
                  : form.entryKind === "concept"
                    ? "개념 설명 · 내용 (텍스트)"
                    : "문제 · 지문 (텍스트)"}
              </label>
              <textarea
                id="question"
                value={form.question}
                onChange={(e) =>
                  setForm((f) => ({ ...f, question: e.target.value }))
                }
                placeholder={
                  form.entryKind === "problem_sheet"
                    ? "문제지 전체 텍스트 또는 보조 설명"
                    : form.entryKind === "concept"
                      ? "개념 정리 또는 설명 본문"
                      : "문제 본문 (이미지와 함께 사용 가능)"
                }
              />
              <div className="textarea-actions">
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() =>
                    setForm((f) => ({ ...f, question: cleanQuestionText(f.question) }))
                  }
                >
                  텍스트 정리
                </button>
              </div>
            </div>

            <ImageField
              label={
                form.entryKind === "problem_sheet"
                  ? "문제지 이미지"
                  : form.entryKind === "concept"
                    ? "개념 이미지 / 참고 자료"
                    : "문제 이미지"
              }
              images={form.questionImages}
              onChange={(questionImages) =>
                setForm((f) => ({ ...f, questionImages }))
              }
              onRemove={removeQuestionImage}
            />

            {form.entryKind === "wrong_answer" && (
              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="myAnswer">내 답</label>
                  <textarea
                    id="myAnswer"
                    value={form.myAnswer}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, myAnswer: e.target.value }))
                    }
                    placeholder="틀린 답"
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="correctAnswer">정답</label>
                  <textarea
                    id="correctAnswer"
                    value={form.correctAnswer}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, correctAnswer: e.target.value }))
                    }
                    placeholder="올바른 답"
                  />
                </div>
              </div>
            )}

            {form.entryKind === "problem_sheet" && (
              <div className="answer-key-editor">
                <div className="explanation-parts-header">
                  <h3 className="form-section-title">답안지</h3>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={addAnswerKeyItem}
                  >
                    + 답안 추가
                  </button>
                </div>
                <p className="form-hint">
                  GPT가 연결한 문항별 정답과 상세 풀이를 저장합니다.
                </p>
                {(form.answerKey ?? []).length === 0 ? (
                  <div className="answer-key-empty">아직 연결된 답안이 없습니다.</div>
                ) : (
                  (form.answerKey ?? []).map((item, index) => (
                    <div key={item.id} className="answer-key-card">
                      <div className="explanation-part-card-head">
                        <span className="explanation-part-label">답안 {index + 1}</span>
                        <button
                          type="button"
                          className="btn-icon danger btn-sm-text"
                          onClick={() => removeAnswerKeyItem(item.id)}
                        >
                          삭제
                        </button>
                      </div>
                      <div className="form-row form-row--2">
                        <div className="form-field">
                          <label htmlFor={`answer-number-${item.id}`}>문항 번호</label>
                          <input
                            id={`answer-number-${item.id}`}
                            value={item.questionNumber}
                            onChange={(event) =>
                              updateAnswerKeyItem(item.id, {
                                questionNumber: event.target.value,
                              })
                            }
                            placeholder="예: 1"
                          />
                        </div>
                        <div className="form-field">
                          <label htmlFor={`answer-value-${item.id}`}>정답</label>
                          <input
                            id={`answer-value-${item.id}`}
                            value={item.answer}
                            onChange={(event) =>
                              updateAnswerKeyItem(item.id, {
                                answer: event.target.value,
                              })
                            }
                            placeholder="예: ③"
                          />
                        </div>
                      </div>
                      <div className="form-row form-row--2">
                        <div className="form-field">
                          <label htmlFor={`answer-difficulty-${item.id}`}>문항 난이도</label>
                          <select
                            id={`answer-difficulty-${item.id}`}
                            value={item.difficulty ?? ""}
                            onChange={(event) =>
                              updateAnswerKeyItem(item.id, {
                                difficulty: event.target.value
                                  ? (event.target.value as NonNullable<typeof item.difficulty>)
                                  : undefined,
                              })
                            }
                          >
                            <option value="">자동/없음</option>
                            <option value="low">하</option>
                            <option value="medium">중</option>
                            <option value="high">상</option>
                          </select>
                        </div>
                        <div className="form-field">
                          <label htmlFor={`answer-concepts-${item.id}`}>연결 개념</label>
                          <input
                            id={`answer-concepts-${item.id}`}
                            value={(item.concepts ?? []).join(", ")}
                            onChange={(event) =>
                              updateAnswerKeyItem(item.id, {
                                concepts: event.target.value
                                  .split(",")
                                  .map((concept) => concept.trim())
                                  .filter(Boolean),
                              })
                            }
                            placeholder="예: 함수, 그래프"
                          />
                        </div>
                      </div>
                      <div className="form-field full">
                        <label htmlFor={`answer-exp-${item.id}`}>상세 풀이</label>
                        <textarea
                          id={`answer-exp-${item.id}`}
                          value={item.explanation}
                          onChange={(event) =>
                            updateAnswerKeyItem(item.id, {
                              explanation: event.target.value,
                            })
                          }
                          placeholder="풀이 또는 정답 근거"
                        />
                      </div>
                      <div className="form-field full">
                        <label htmlFor={`answer-notes-${item.id}`}>문제별 메모</label>
                        <textarea
                          id={`answer-notes-${item.id}`}
                          value={item.notes ?? ""}
                          onChange={(event) =>
                            updateAnswerKeyItem(item.id, {
                              notes: event.target.value,
                            })
                          }
                          placeholder="이 문항에만 붙일 메모"
                        />
                      </div>
                      <div className="form-field full">
                        <label htmlFor={`answer-points-${item.id}`}>중요 포인트</label>
                        <textarea
                          id={`answer-points-${item.id}`}
                          value={item.importantPoints.join("\n")}
                          onChange={(event) =>
                            updateAnswerKeyItem(item.id, {
                              importantPoints: event.target.value
                                .split(/\r?\n/)
                                .map((point) => point.trim())
                                .filter(Boolean),
                            })
                          }
                          placeholder="한 줄에 하나씩 입력"
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="explanation-parts-header">
              <h3 className="form-section-title">해설</h3>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={addExplanationPart}
              >
                + 해설 블록 추가
              </button>
            </div>
            <p className="form-hint">
              해설이 여러 개면 블록을 나누면, 복습 화면에서 해설 1, 해설 2로
              구분됩니다.
            </p>

            {form.explanationParts.map((part, idx) => (
              <div key={part.id} className="explanation-part-card">
                <div className="explanation-part-card-head">
                  <span className="explanation-part-label">해설 {idx + 1}</span>
                  {form.explanationParts.length > 1 && (
                    <button
                      type="button"
                      className="btn-icon danger btn-sm-text"
                      onClick={() => removeExplanationPart(idx)}
                    >
                      이 블록 삭제
                    </button>
                  )}
                </div>
                <div className="form-field full">
                  <label htmlFor={`exp-${part.id}`}>텍스트</label>
                  <textarea
                    id={`exp-${part.id}`}
                    value={part.text}
                    onChange={(e) =>
                      updateExplanationPart(idx, { text: e.target.value })
                    }
                    placeholder="해설·풀이"
                  />
                </div>
                <ImageField
                  label="이미지"
                  images={part.images}
                  onChange={(images) => setPartImages(idx, images)}
                  onRemove={(filename) => removeExplanationImage(idx, filename)}
                />
              </div>
            ))}

            <div className="form-field full">
              <div className="form-label-row">
                <label htmlFor="memo">메모</label>
                {memoTemplates.length > 0 && (
                  <select
                    aria-label="메모 템플릿"
                    className="memo-template-select"
                    defaultValue=""
                    onChange={(event) => {
                      const template = memoTemplates.find((item) => item.id === event.target.value);
                      if (template) {
                        setForm((current) => ({
                          ...current,
                          memo: current.memo.trim()
                            ? `${current.memo.trim()}\n\n${template.content}`
                            : template.content,
                        }));
                      }
                      event.currentTarget.value = "";
                    }}
                  >
                    <option value="">메모 템플릿</option>
                    {memoTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <textarea
                id="memo"
                value={form.memo}
                onChange={(e) =>
                  setForm((f) => ({ ...f, memo: e.target.value }))
                }
                placeholder="개인 메모"
              />
            </div>

            <div className="form-field full">
              <label>태그</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="태그 입력 후 Enter"
                />
                <button type="button" className="btn-secondary" onClick={addTag}>
                  추가
                </button>
                {form.entryKind === "problem_sheet" && form.tags.length > 0 && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setForm((f) => ({ ...f, tags: [] }))}
                  >
                    태그 전체 삭제
                  </button>
                )}
              </div>
              {form.tags.length > 0 && (
                <div className="tags" style={{ marginTop: "0.5rem" }}>
                  {form.tags.map((t) => (
                    <span key={t} className="tag">
                      #{t}
                      <button
                        type="button"
                        style={{
                          marginLeft: "0.3rem",
                          color: "var(--danger)",
                          fontSize: "0.7rem",
                        }}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            tags: f.tags.filter((x) => x !== t),
                          }))
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="form-footer">
            {saveError && (
              <p className="form-save-error" role="alert">
                {saveError}
              </p>
            )}
            <button type="button" className="btn-secondary" onClick={onClose}>
              취소
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
