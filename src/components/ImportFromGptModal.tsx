import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { v4 as uuidv4 } from "uuid";
import { saveImageFiles } from "../api";
import type {
  AiProviderSettings,
  AiProviderStatus,
  EntryFormData,
  PromptTemplate,
  SheetAnswerItem,
  SheetFigureItem,
  Subject,
  WrongAnswerEntry,
} from "../types";
import { SUBJECTS } from "../types";
import {
  parseImportedStudyText,
  isSafeImportImageFilename,
  readImportFile,
  type ImportedStudyText,
} from "../utils/importStudyText";
import { validateImportedStudyData } from "../utils/importValidation";
import {
  normalizeImportAudit,
  normalizeRejectedNotes,
  removeRejectedNotes,
  scrubRejectedNotesFromAnswers,
} from "../utils/importAudit";
import { buildMathSolutionPrompt, type GptSolutionApplyMode } from "../utils/gptSolution";
import { cleanQuestionText } from "../utils/textCleanup";
import { parseQuestionText } from "../utils/textLayout";
import ImageField from "./ImageField";

interface ImportFromGptModalProps {
  onClose: () => void;
  onApply: (data: Partial<EntryFormData>, applyMode?: GptSolutionApplyMode) => void;
  fallbackSubject: Subject;
  promptTemplates?: PromptTemplate[];
  aiProvider?: AiProviderSettings;
  aiProviderStatus?: AiProviderStatus | null;
  onGenerateWithAi?: (prompt: string, inputText: string, imageFilenames: string[]) => Promise<string>;
  onAiFallback?: () => void;
  selectedPromptTemplateId?: string;
  onPromptTemplateSelect?: (templateId: string) => void;
  onSavePromptTemplate?: (template: PromptTemplate) => Promise<void>;
  sourceEntry?: WrongAnswerEntry;
  mode?: "import" | "solution";
}

function cloneDraft(data: Partial<EntryFormData>): Partial<EntryFormData> {
  return {
    ...data,
    tags: data.tags ? [...data.tags] : [],
    questionImages: data.questionImages ? [...data.questionImages] : [],
    answerKey: data.answerKey
      ? data.answerKey.map((item) => ({
          ...item,
          importantPoints: [...item.importantPoints],
          concepts: item.concepts ? [...item.concepts] : [],
        }))
      : [],
    figures: data.figures ? data.figures.map((figure) => ({ ...figure })) : [],
    importAudit: data.importAudit ? {
      ...data.importAudit,
      expectedQuestionNumbers: [...data.importAudit.expectedQuestionNumbers],
      detectedQuestionNumbers: [...data.importAudit.detectedQuestionNumbers],
      missingQuestionNumbers: [...data.importAudit.missingQuestionNumbers],
      uncertainQuestionNumbers: [...data.importAudit.uncertainQuestionNumbers],
    } : undefined,
    rejectedNotes: data.rejectedNotes ? [...data.rejectedNotes] : [],
  };
}

function answerDifficultyLabel(value: SheetAnswerItem["difficulty"]) {
  if (value === "high") return "상";
  if (value === "medium") return "중";
  if (value === "low") return "하";
  return "자동";
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop()?.trim() ?? path.trim();
}

function imageFileKey(name: string): string {
  return basename(name).toLowerCase();
}

function isSupportedImageFile(name: string): boolean {
  return /\.(png|jpe?g|webp)$/i.test(name);
}

function imageMimeType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

const MAX_ALL_IN_ONE_ZIP_BYTES = 50 * 1024 * 1024;
const MAX_IMPORT_JSON_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ZIP_ENTRIES = 100;
const MAX_IMPORT_IMAGE_COUNT = 20;
const MAX_IMPORT_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMPORT_TOTAL_IMAGE_BYTES = 100 * 1024 * 1024;

function assertImportJsonSize(name: string, size: number) {
  if (size > MAX_IMPORT_JSON_BYTES) {
    throw new Error(`${name} 파일이 너무 큽니다. JSON은 5MB 이하만 가져올 수 있습니다.`);
  }
}

function assertImportImages(files: File[]) {
  if (files.length > MAX_IMPORT_IMAGE_COUNT) {
    throw new Error(`이미지가 너무 많습니다. 한 번에 ${MAX_IMPORT_IMAGE_COUNT}개 이하만 가져올 수 있습니다.`);
  }
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_IMPORT_TOTAL_IMAGE_BYTES) {
    throw new Error("이미지 전체 용량이 너무 큽니다. 전체 100MB 이하만 가져올 수 있습니다.");
  }
  const oversized = files.find((file) => file.size > MAX_IMPORT_IMAGE_BYTES);
  if (oversized) {
    throw new Error(`${oversized.name} 파일이 너무 큽니다. 이미지는 파일당 10MB 이하만 가져올 수 있습니다.`);
  }
}

function ImagePreprocessor({ onAddImage }: { onAddImage: (filename: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [rotation, setRotation] = useState(0);
  const [grayscale, setGrayscale] = useState(false);
  const [contrast, setContrast] = useState(110);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const process = async () => {
    if (!file) return;
    setError(null);
    try {
      const image = await loadImage(preview);
      const rotateRight = ((rotation % 360) + 360) % 360;
      const swapped = rotateRight === 90 || rotateRight === 270;
      const canvas = document.createElement("canvas");
      canvas.width = swapped ? image.height : image.width;
      canvas.height = swapped ? image.width : image.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("이미지 보정 캔버스를 만들지 못했습니다.");
      ctx.filter = `${grayscale ? "grayscale(1)" : ""} contrast(${contrast}%)`.trim();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotateRight * Math.PI) / 180);
      ctx.drawImage(image, -image.width / 2, -image.height / 2);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error("보정 이미지를 만들지 못했습니다."));
        }, "image/png");
      });
      const processed = new File([blob], `processed-${file.name.replace(/\.[^.]+$/, "")}.png`, {
        type: "image/png",
      });
      const [filename] = await saveImageFiles([processed]);
      if (filename) onAddImage(filename);
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : "이미지를 보정하지 못했습니다.");
    }
  };

  return (
    <div className="image-preprocessor">
      <div className="form-field full">
        <label htmlFor="preprocess-image">GPT용 사진 보정</label>
        <input
          id="preprocess-image"
          type="file"
          accept="image/*"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </div>
      {preview && (
        <>
          <div className="image-preprocess-preview">
            <img
              src={preview}
              alt=""
              style={{ transform: `rotate(${rotation}deg)`, filter: `${grayscale ? "grayscale(1)" : ""} contrast(${contrast}%)` }}
            />
          </div>
          <div className="image-preprocess-controls">
            <button type="button" className="btn-secondary btn-sm" onClick={() => setRotation((value) => value + 90)}>
              90도 회전
            </button>
            <label>
              <input type="checkbox" checked={grayscale} onChange={(event) => setGrayscale(event.target.checked)} />
              흑백
            </label>
            <label>
              명암
              <input
                type="range"
                min="80"
                max="180"
                value={contrast}
                onChange={(event) => setContrast(Number(event.target.value))}
              />
            </label>
            <button type="button" className="btn-secondary btn-sm" onClick={process}>
              보정 이미지 첨부
            </button>
          </div>
        </>
      )}
      {error && <p className="image-field-error">{error}</p>}
    </div>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    image.src = src;
  });
}

export default function ImportFromGptModal({
  onClose,
  onApply,
  fallbackSubject,
  promptTemplates = [],
  aiProvider,
  aiProviderStatus,
  onGenerateWithAi,
  onAiFallback,
  selectedPromptTemplateId,
  onPromptTemplateSelect,
  onSavePromptTemplate,
  sourceEntry,
  mode = "import",
}: ImportFromGptModalProps) {
  const isSolutionMode = mode === "solution" && Boolean(sourceEntry);
  const solutionPrompt = sourceEntry ? buildMathSolutionPrompt(sourceEntry) : "";
  const availablePromptTemplates = useMemo(
    () =>
      isSolutionMode
        ? [
            {
              id: "builtin-math-solution-quick",
              name: "수학 해설 JSON",
              content: solutionPrompt,
              builtIn: true,
            },
          ]
        : promptTemplates,
    [isSolutionMode, promptTemplates, solutionPrompt],
  );
  const defaultPromptId = isSolutionMode
    ? availablePromptTemplates[0]?.id ?? ""
    : selectedPromptTemplateId ?? availablePromptTemplates[0]?.id ?? "";
  const [rawText, setRawText] = useState("");
  const [filename, setFilename] = useState<string | undefined>();
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [watchClipboard, setWatchClipboard] = useState(false);
  const [applyMode, setApplyMode] = useState<GptSolutionApplyMode>("fill");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [activePromptId, setActivePromptId] = useState(defaultPromptId);
  const [draft, setDraft] = useState<Partial<EntryFormData> | null>(null);
  const [draftOverride, setDraftOverride] = useState<Partial<EntryFormData> | null>(null);
  const [confirmedValidationErrors, setConfirmedValidationErrors] = useState(false);

  const parsed: ImportedStudyText | null = useMemo(() => {
    if (!rawText.trim()) return null;
    return parseImportedStudyText(rawText, filename, fallbackSubject);
  }, [fallbackSubject, filename, rawText]);

  useEffect(() => {
    setActivePromptId(defaultPromptId);
  }, [defaultPromptId]);

  useEffect(() => {
    setDraft(draftOverride ? cloneDraft(draftOverride) : parsed ? cloneDraft(parsed.data) : null);
  }, [draftOverride, parsed]);

  useEffect(() => {
    if (!watchClipboard) return;
    let cancelled = false;
    let lastText = rawText;
    const readClipboard = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (cancelled || !text.trim() || text === lastText) return;
        lastText = text;
        setRawText(text);
        setFilename(undefined);
        setDraftOverride(null);
        setError(null);
        setCopyMessage("클립보드에서 GPT 답변을 가져왔습니다.");
      } catch {
        if (!cancelled) {
          setWatchClipboard(false);
          setError("클립보드 읽기 권한이 없어 자동 대기를 중지했습니다. 직접 붙여넣어 주세요.");
        }
      }
    };
    void readClipboard();
    const timer = window.setInterval(readClipboard, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [rawText, watchClipboard]);

  const activePrompt = availablePromptTemplates.find((template) => template.id === activePromptId);
  const question = draft?.question ?? "";
  const answerKey = draft?.answerKey ?? [];
  const figures = draft?.figures ?? [];
  const hasMemo = Boolean(draft?.memo?.trim());
  const questionBlocks = useMemo(() => parseQuestionText(question), [question]);
  const questionCount = questionBlocks.filter((block) => block.kind === "question").length;
  const validationReport = useMemo(() => (draft ? validateImportedStudyData(draft) : null), [draft]);
  const hasValidationErrors = Boolean(validationReport?.issues.some((issue) => issue.severity === "error"));
  const canApply = Boolean(draft?.question?.trim()) && (!hasValidationErrors || confirmedValidationErrors);
  const aiImageFilenames = isSolutionMode && sourceEntry ? sourceEntry.questionImages : images;
  const hasAiVisionImages = aiImageFilenames.length > 0;
  const canUseAiProvider = Boolean(
    onGenerateWithAi &&
    aiProvider &&
    aiProvider.enabled &&
    aiProvider.type !== "manual" &&
    aiProviderStatus?.available,
  );
  const canRunAiProvider = Boolean(
    canUseAiProvider &&
    hasAiVisionImages &&
    !aiGenerating,
  );

  useEffect(() => {
    setConfirmedValidationErrors(false);
  }, [draft, rawText]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      setRawText(await readImportFile(file));
      setFilename(file.name);
      setDraftOverride(null);
    } catch (fileError) {
      setError(
        fileError instanceof Error && fileError.message
          ? fileError.message
          : "파일을 읽지 못했습니다.",
      );
    }
  };

  const copyPrompt = async () => {
    if (!activePrompt) return;
    try {
      await navigator.clipboard.writeText(activePrompt.content);
      setCopyMessage("프롬프트를 복사했습니다.");
    } catch {
      setCopyMessage("클립보드 복사에 실패했습니다.");
    }
  };

  const readClipboardNow = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setError("클립보드에 가져올 텍스트가 없습니다.");
        return;
      }
      setRawText(text);
      setFilename(undefined);
      setDraftOverride(null);
      setError(null);
      setCopyMessage("클립보드에서 가져왔습니다.");
    } catch {
      setError("클립보드에서 읽지 못했습니다. GPT 답변을 직접 붙여넣어 주세요.");
    }
  };

  const generateWithAiProvider = async () => {
    if (!activePrompt || !onGenerateWithAi) return;
    setAiGenerating(true);
    setError(null);
    try {
      const inputText = isSolutionMode && sourceEntry
        ? [
            sourceEntry.title,
            sourceEntry.question,
            sourceEntry.myAnswer && `내 답: ${sourceEntry.myAnswer}`,
            sourceEntry.correctAnswer && `정답: ${sourceEntry.correctAnswer}`,
            sourceEntry.memo && `메모: ${sourceEntry.memo}`,
          ].filter(Boolean).join("\n\n")
        : rawText;
      if (!hasAiVisionImages) {
        throw new Error("Gemini Vision을 사용하려면 먼저 문제/답안지 이미지를 첨부해 주세요.");
      }
      const aiText = await onGenerateWithAi(activePrompt.content, inputText, aiImageFilenames);
      const parsedText = parseImportedStudyText(aiText, "gemini.json", fallbackSubject);
      if (parsedText.detectedFormat !== "json") {
        throw new Error("Gemini 응답이 순수 JSON 객체가 아닙니다.");
      }
      validateImportedStudyData(parsedText.data);
      setRawText(aiText);
      setFilename("gemini.json");
      setDraftOverride(null);
      setCopyMessage("AI provider 결과를 가져왔습니다.");
    } catch (aiError) {
      onAiFallback?.();
      setError(
        `${
          aiError instanceof Error && aiError.message
            ? aiError.message
            : "AI provider 호출에 실패했습니다."
        } manual 모드로 붙여넣기를 계속 사용할 수 있습니다.`,
      );
    } finally {
      setAiGenerating(false);
    }
  };

  const collectAllInOneFiles = async (files: File[]) => {
    const zipFile = files.find((file) => file.name.toLowerCase().endsWith(".zip"));
    if (zipFile) {
      if (zipFile.size > MAX_ALL_IN_ONE_ZIP_BYTES) {
        throw new Error("ZIP 파일이 너무 큽니다. 50MB 이하 파일만 가져올 수 있습니다.");
      }
      const zip = await JSZip.loadAsync(zipFile);
      const entries = Object.values(zip.files).filter((entry) => !entry.dir);
      if (entries.length > MAX_IMPORT_ZIP_ENTRIES) {
        throw new Error(`ZIP 안의 파일이 너무 많습니다. ${MAX_IMPORT_ZIP_ENTRIES}개 이하만 가져올 수 있습니다.`);
      }
      const jsonEntries = entries.filter((entry) => entry.name.toLowerCase().endsWith(".json"));
      const importJson = jsonEntries.find((entry) => basename(entry.name).toLowerCase() === "import.json");
      if (!importJson && jsonEntries.length !== 1) {
        throw new Error("ZIP 안에는 import.json 또는 JSON 파일 1개만 있어야 합니다.");
      }
      const jsonEntry = importJson ?? jsonEntries[0];
      if (!jsonEntry) throw new Error("ZIP 안에서 import.json을 찾지 못했습니다.");
      const imageEntries = entries.filter((entry) => isSupportedImageFile(entry.name));
      if (imageEntries.length > MAX_IMPORT_IMAGE_COUNT) {
        throw new Error(`ZIP 안의 이미지가 너무 많습니다. ${MAX_IMPORT_IMAGE_COUNT}개 이하만 가져올 수 있습니다.`);
      }
      const imageFiles = await Promise.all(
        imageEntries.map(async (entry) => {
          const blob = await entry.async("blob");
          const name = basename(entry.name);
          return new File([blob], name, { type: imageMimeType(name) });
        }),
      );
      assertImportImages(imageFiles);
      const jsonText = await jsonEntry.async("text");
      assertImportJsonSize(basename(jsonEntry.name), new Blob([jsonText]).size);
      return {
        jsonText,
        jsonName: basename(jsonEntry.name),
        imageFiles,
      };
    }

    const jsonFiles = files.filter((file) => file.name.toLowerCase().endsWith(".json"));
    if (jsonFiles.length !== 1) throw new Error("import.json 1개와 이미지 파일들을 함께 선택해 주세요.");
    assertImportJsonSize(jsonFiles[0].name, jsonFiles[0].size);
    const imageFiles = files.filter((file) => isSupportedImageFile(file.name));
    assertImportImages(imageFiles);
    return {
      jsonText: await jsonFiles[0].text(),
      jsonName: jsonFiles[0].name,
      imageFiles,
    };
  };

  const buildAllInOneDraft = async (
    jsonText: string,
    jsonName: string,
    imageFiles: File[],
  ): Promise<Partial<EntryFormData>> => {
    const imported = parseImportedStudyText(jsonText, jsonName, fallbackSubject);
    if (imported.detectedFormat !== "json") {
      throw new Error("올인원 가져오기는 순수 JSON 결과가 필요합니다.");
    }
    const imageByName = new Map(imageFiles.map((file) => [imageFileKey(file.name), file]));
    const filesToSave: File[] = [];
    const fileIndexByKey = new Map<string, number>();

    for (const figure of imported.data.figures ?? []) {
      if (!figure.image || !isSafeImportImageFilename(figure.image)) continue;
      const key = imageFileKey(figure.image);
      const file = imageByName.get(key);
      if (!file || fileIndexByKey.has(key)) continue;
      fileIndexByKey.set(key, filesToSave.length);
      filesToSave.push(file);
    }

    const savedFilenames = filesToSave.length ? await saveImageFiles(filesToSave) : [];
    const linkedFigures: SheetFigureItem[] = (imported.data.figures ?? []).map((figure) => {
      if (!figure.image || !isSafeImportImageFilename(figure.image)) {
        return { ...figure, image: undefined, needsReview: true };
      }
      const index = fileIndexByKey.get(imageFileKey(figure.image));
      const saved = index === undefined ? undefined : savedFilenames[index];
      return saved
        ? { ...figure, image: saved, needsReview: figure.needsReview ?? false }
        : { ...figure, image: undefined, needsReview: true };
    });

    return {
      ...imported.data,
      figures: linkedFigures,
    };
  };

  const handleAllInOneFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    setError(null);
    try {
      const { jsonText, jsonName, imageFiles } = await collectAllInOneFiles(files);
      const linkedDraft = await buildAllInOneDraft(jsonText, jsonName, imageFiles);
      setRawText(jsonText);
      setFilename(jsonName);
      setDraftOverride(linkedDraft);
      setCopyMessage(`올인원 가져오기 완료: 도표/그림 ${linkedDraft.figures?.length ?? 0}개 감지`);
    } catch (allInOneError) {
      setError(allInOneError instanceof Error ? allInOneError.message : "올인원 파일을 가져오지 못했습니다.");
    }
  };

  const savePromptTemplate = async () => {
    if (!onSavePromptTemplate || !activePrompt) return;
    const name = prompt("저장할 프롬프트 템플릿 이름을 입력하세요.", activePrompt.name);
    if (!name?.trim()) return;
    await onSavePromptTemplate({
      id: uuidv4(),
      name: name.trim(),
      content: activePrompt.content,
    });
    setCopyMessage("프롬프트 템플릿을 저장했습니다.");
  };

  const updateAnswer = (id: string, patch: Partial<SheetAnswerItem>) => {
    setDraft((current) => ({
      ...current,
      answerKey: (current?.answerKey ?? []).map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
  };

  const removeAnswer = (id: string) => {
    setDraft((current) => ({
      ...current,
      answerKey: (current?.answerKey ?? []).filter((item) => item.id !== id),
    }));
  };

  const apply = () => {
    if (!draft || !canApply) return;
    const rejectedNotes = normalizeRejectedNotes(draft.rejectedNotes);
    const answerKey = scrubRejectedNotesFromAnswers(draft.answerKey ?? [], rejectedNotes);
    const question = cleanQuestionText(removeRejectedNotes(draft.question ?? "", rejectedNotes));
    const normalizedDraft = {
      ...draft,
      question,
      memo: removeRejectedNotes(draft.memo ?? "", rejectedNotes),
      answerKey,
      rejectedNotes,
      importAudit: draft.importAudit
        ? normalizeImportAudit(draft.importAudit, { question, answerKey, figures: draft.figures })
        : undefined,
    };
    const finalReport = validateImportedStudyData(normalizedDraft);
    if (finalReport.issues.some((issue) => issue.severity === "error") && !confirmedValidationErrors) {
      setError("위험 검증 항목을 확인한 뒤 체크박스를 선택해야 적용할 수 있습니다.");
      return;
    }
    onApply({
      ...normalizedDraft,
      questionImages: isSolutionMode ? sourceEntry?.questionImages ?? [] : images,
    }, isSolutionMode ? applyMode : undefined);
  };

  return (
    <div className="form-overlay" onClick={onClose}>
      <div className="form-modal form-modal--wide import-modal" onClick={(event) => event.stopPropagation()}>
        <div className="form-header">
          <h2>{isSolutionMode ? "GPT 해설 빠른 가져오기" : "GPT 결과 가져오기"}</h2>
          <button type="button" className="btn-icon" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="form-body import-modal-body">
          <div className="import-grid">
            <section className="import-pane">
              {availablePromptTemplates.length > 0 && (
                <div className="prompt-template-box">
                  <div className="form-row form-row--2">
                    <div className="form-field">
                      <label htmlFor="prompt-template">GPT 프롬프트</label>
                      <select
                        id="prompt-template"
                        value={activePromptId}
                        onChange={(event) => {
                          setActivePromptId(event.target.value);
                          onPromptTemplateSelect?.(event.target.value);
                        }}
                      >
                        {availablePromptTemplates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-field form-field--button">
                      <label aria-hidden="true">&nbsp;</label>
                      <div className="prompt-actions">
                        <button type="button" className="btn-secondary btn-sm" onClick={copyPrompt}>
                          프롬프트 복사
                        </button>
                        {!isSolutionMode && (
                          <button type="button" className="btn-secondary btn-sm" onClick={savePromptTemplate}>
                            템플릿 저장
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={generateWithAiProvider}
                          disabled={!canRunAiProvider}
                          title={
                            !canUseAiProvider
                              ? "manual provider 또는 API 비활성 상태입니다."
                              : !hasAiVisionImages
                                ? "Gemini Vision 분석에는 첨부 이미지가 필요합니다."
                                : "Tauri에서 Gemini provider를 호출합니다."
                          }
                        >
                          {aiGenerating ? "AI 가져오는 중..." : "AI로 가져오기"}
                        </button>
                      </div>
                    </div>
                  </div>
                  <pre>{activePrompt?.content}</pre>
                  <p className="form-hint">
                    Provider: {aiProvider?.type ?? "manual"}
                    {aiProvider?.type === "manual" || !aiProvider?.enabled
                      ? " · manual 붙여넣기 모드"
                      : aiProviderStatus?.available
                        ? " · API 사용 가능"
                        : " · API key 또는 설정 확인 필요"}
                  </p>
                  {canUseAiProvider && !hasAiVisionImages && (
                    <p className="form-hint import-vision-warning">
                      Gemini Vision을 쓰려면 먼저 문제/답안지 이미지를 첨부하거나, 기존 항목에 이미지를 추가해 주세요.
                    </p>
                  )}
                  {copyMessage && <p className="form-hint">{copyMessage}</p>}
                </div>
              )}

              <div className="form-field full">
                <label htmlFor="gpt-import-text">GPT 답변 붙여넣기</label>
                <textarea
                  id="gpt-import-text"
                  className="import-textarea"
                  value={rawText}
                  onChange={(event) => {
                    setRawText(event.target.value);
                    setFilename(undefined);
                    setDraftOverride(null);
                    setError(null);
                  }}
                  placeholder={isSolutionMode ? "ChatGPT가 만든 해설 JSON을 붙여넣으세요." : "GPT가 사진에서 변환한 시험지 텍스트나 JSON을 붙여넣으세요."}
                />
              </div>

              <div className="clipboard-actions">
                <button type="button" className="btn-secondary btn-sm" onClick={readClipboardNow}>
                  클립보드에서 가져오기
                </button>
                <button
                  type="button"
                  className={`btn-secondary btn-sm ${watchClipboard ? "active" : ""}`}
                  onClick={() => setWatchClipboard((value) => !value)}
                >
                  GPT 답변 대기 {watchClipboard ? "ON" : "OFF"}
                </button>
              </div>

              {isSolutionMode && sourceEntry && (
                <div className="gpt-task-package">
                  <span>GPT 작업 패키지</span>
                  <p>프롬프트를 복사한 뒤 ChatGPT에 현재 문제 이미지와 함께 붙여넣으세요.</p>
                  <div className="gpt-image-list">
                    {sourceEntry.questionImages.length ? (
                      sourceEntry.questionImages.map((image) => <code key={image}>{image}</code>)
                    ) : (
                      <small>첨부 이미지 없음</small>
                    )}
                  </div>
                </div>
              )}

              <div className="form-field full">
                <label htmlFor="gpt-import-file">텍스트 파일 업로드</label>
                <input
                  id="gpt-import-file"
                  type="file"
                  accept=".txt,.md,.json,text/plain,text/markdown,application/json"
                  onChange={(event) => handleFile(event.target.files?.[0])}
                />
              </div>

              {!isSolutionMode && (
                <div className="form-field full all-in-one-import">
                  <label htmlFor="gpt-all-in-one-file">올인원 가져오기</label>
                  <input
                    id="gpt-all-in-one-file"
                    type="file"
                    multiple
                    accept=".zip,.json,.png,.jpg,.jpeg,.webp,application/zip,application/json,image/png,image/jpeg,image/webp"
                    onChange={(event) => handleAllInOneFiles(event.target.files)}
                  />
                  <p className="form-hint">
                    ZIP 하나 또는 import.json과 PNG/JPG/WebP 파일들을 함께 선택하세요. JSON의 figures[].image 파일명과 실제 이미지 파일명이 연결됩니다.
                  </p>
                </div>
              )}

              <div className="import-json-example">
                <span>권장 JSON 예시</span>
                <pre>{`{
  "title": "2026 중간고사 오답",
  "subject": "수학",
  "question": "1. ...\\n① ...",
  "importantNotes": ["문제 3은 조건 해석이 핵심"],
  "rejectedNotes": [],
  "audit": {
    "expectedQuestionNumbers": ["1"],
    "detectedQuestionNumbers": ["1"],
    "missingQuestionNumbers": [],
    "uncertainQuestionNumbers": [],
    "handwritingExcluded": true,
    "needsReviewCount": 0
  },
  "concepts": ["함수", "그래프"],
  "answerKey": [
    {
      "questionNumber": "1",
      "answer": "③",
      "explanation": "조건을 대입하면 ...",
      "notes": "이 문항에서만 다시 볼 메모",
      "importantPoints": ["보기 ②와 ③의 차이 확인"],
      "concepts": ["함수"],
      "needsReview": false,
      "sourceNote": "답안지 1번과 연결"
    }
  ],
  "figures": [
    {
      "questionNumber": "1",
      "title": "1번 그래프",
      "caption": "x축과 y축의 교점이 표시된 그래프",
      "image": "graph_1.png",
      "source": "gpt_cleaned",
      "needsReview": false
    }
  ],
  "memo": "전체 학습 메모"
}`}</pre>
              </div>

              {!isSolutionMode && (
                <>
                  <ImagePreprocessor
                    onAddImage={(filenameToAdd) => setImages((current) => [...current, filenameToAdd])}
                  />

                  <ImageField
                    label="원본 사진"
                    images={images}
                    onChange={setImages}
                    onRemove={(filenameToRemove) =>
                      setImages((current) => current.filter((item) => item !== filenameToRemove))
                    }
                  />
                </>
              )}
            </section>

            <section className="import-pane import-preview" aria-live="polite">
              <h3>미리보기 · 수정</h3>
              {error && (
                <p className="form-save-error" role="alert">
                  {error}
                </p>
              )}
              {!draft || !parsed ? (
                <div className="import-preview-empty">붙여넣기 또는 파일 업로드를 하면 미리보기가 표시됩니다.</div>
              ) : (
                <>
                  {validationReport?.audit && (
                    <div className={`import-audit-summary ${validationReport.issues.some((issue) => issue.severity === "error") ? "import-audit-summary--danger" : ""}`} role="alert">
                      <strong>AI 판독 감사</strong>
                      <span>예상 {validationReport.audit.expectedQuestionNumbers.length} · 감지 {validationReport.audit.detectedQuestionNumbers.length} · 검토 {validationReport.audit.needsReviewCount}</span>
                      {validationReport.audit.missingQuestionNumbers.length > 0 && (
                        <p>누락 문제: {validationReport.audit.missingQuestionNumbers.join(", ")}</p>
                      )}
                      {validationReport.audit.uncertainQuestionNumbers.length > 0 && (
                        <p>불확실 문제: {validationReport.audit.uncertainQuestionNumbers.join(", ")}</p>
                      )}
                      {!validationReport.audit.handwritingExcluded && <p>손글씨 제외 여부가 확인되지 않았습니다.</p>}
                      {(draft.rejectedNotes ?? []).length > 0 && (
                        <div className="import-rejected-notes">
                          <b>학습 데이터에서 제외된 학생 필기</b>
                          <p>자동 제거는 같은 문구 중심으로만 보장됩니다. 문제 본문, 메모, 답안지에 학생 필기가 남았는지 직접 확인하세요.</p>
                          <ul>{(draft.rejectedNotes ?? []).map((note) => <li key={note}>{note}</li>)}</ul>
                        </div>
                      )}
                    </div>
                  )}
                  {parsed.detectedFormat !== "json" && (
                    <div className="import-format-warning" role="alert">
                      JSON이 아닌 텍스트로 감지되었습니다. GPT 프롬프트를 다시 복사해 순수 JSON 객체로 받아오면 답안지와 난이도 연결이 더 정확합니다.
                    </div>
                  )}
                  <dl className="import-preview-meta">
                    <div>
                      <dt>형식</dt>
                      <dd>{parsed.detectedFormat === "json" ? "JSON" : "텍스트"}</dd>
                    </div>
                    <div>
                      <dt>제목</dt>
                      <dd>{draft.title || "(제목 없음)"}</dd>
                    </div>
                    <div>
                      <dt>문제 수</dt>
                      <dd>{questionCount}개</dd>
                    </div>
                    <div>
                      <dt>이미지</dt>
                      <dd>{images.length}개</dd>
                    </div>
                    <div>
                      <dt>도표/그림</dt>
                      <dd>{figures.length}개</dd>
                    </div>
                    <div>
                      <dt>답안 연결</dt>
                      <dd>{answerKey.length}개</dd>
                    </div>
                    <div>
                      <dt>메모</dt>
                      <dd>{hasMemo ? "있음" : "없음"}</dd>
                    </div>
                    <div>
                      <dt>검증</dt>
                      <dd>{validationReport?.issues.length ? `${validationReport.issues.length}개 확인` : "문제 없음"}</dd>
                    </div>
                  </dl>

                  {isSolutionMode && (
                    <div className="apply-mode-toggle" aria-label="해설 적용 방식">
                      <button
                        type="button"
                        className={applyMode === "fill" ? "active" : ""}
                        onClick={() => setApplyMode("fill")}
                      >
                        빈 칸만 채우기
                      </button>
                      <button
                        type="button"
                        className={applyMode === "overwrite" ? "active" : ""}
                        onClick={() => setApplyMode("overwrite")}
                      >
                        기존 해설 덮어쓰기
                      </button>
                    </div>
                  )}

                  {validationReport && validationReport.issues.length > 0 && (
                    <div className="import-validation-report">
                      {validationReport.issues.slice(0, 8).map((issue) => (
                        <p key={issue.id} className={`import-validation-issue import-validation-issue--${issue.severity}`}>
                          {issue.message}
                        </p>
                      ))}
                    </div>
                  )}

                  {hasValidationErrors && (
                    <label className="settings-checkbox import-danger-confirm">
                      <input
                        type="checkbox"
                        checked={confirmedValidationErrors}
                        onChange={(event) => setConfirmedValidationErrors(event.target.checked)}
                      />
                      위험 검증 항목을 확인했고, 누락 문제·손글씨 혼입·도표 연결 상태를 직접 검토했습니다.
                    </label>
                  )}

                  <div className="form-row form-row--2">
                    <div className="form-field">
                      <label htmlFor="import-title">제목</label>
                      <input
                        id="import-title"
                        value={draft.title ?? ""}
                        onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                      />
                    </div>
                    <div className="form-field">
                      <label htmlFor="import-subject">과목</label>
                      <select
                        id="import-subject"
                        value={draft.subject ?? fallbackSubject}
                        onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))}
                      >
                        {SUBJECTS.map((subject) => (
                          <option key={subject} value={subject}>
                            {subject}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="form-field full">
                    <label htmlFor="import-question">본문</label>
                    <textarea
                      id="import-question"
                      className="import-preview-edit"
                      value={draft.question ?? ""}
                      onChange={(event) => setDraft((current) => ({ ...current, question: event.target.value }))}
                    />
                  </div>
                  <div className="form-field full">
                    <label htmlFor="import-memo">메모</label>
                    <textarea
                      id="import-memo"
                      value={draft.memo ?? ""}
                      onChange={(event) => setDraft((current) => ({ ...current, memo: event.target.value }))}
                    />
                  </div>
                  <div className="form-field full">
                    <label htmlFor="import-tags">태그</label>
                    <div className="import-tags-edit">
                      <input
                        id="import-tags"
                        value={(draft.tags ?? []).join(", ")}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean),
                          }))
                        }
                      />
                      {(draft.tags ?? []).length > 0 && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setDraft((current) => ({ ...current, tags: [] }))}
                        >
                          태그 전체 삭제
                        </button>
                      )}
                    </div>
                  </div>

                  {answerKey.length > 0 && (
                    <div className="import-answer-preview">
                      <h4>답안지 미리보기</h4>
                      <div className="import-answer-table">
                        {answerKey.map((item) => (
                          <div key={item.id} className="import-answer-row import-answer-row--editable">
                            <input
                              aria-label={`${item.questionNumber || "답안"} 문항 번호`}
                              value={item.questionNumber}
                              onChange={(event) => updateAnswer(item.id, { questionNumber: event.target.value })}
                            />
                            <input
                              aria-label={`${item.questionNumber || "답안"} 정답`}
                              value={item.answer}
                              onChange={(event) => updateAnswer(item.id, { answer: event.target.value })}
                            />
                            <span className="import-answer-value">{item.answer || "정답 없음"}</span>
                            {item.needsReview && <small className="answer-review-badge">검토 필요</small>}
                            <select
                              aria-label={`${item.questionNumber || "답안"} 난이도`}
                              value={item.difficulty ?? ""}
                              onChange={(event) =>
                                updateAnswer(item.id, {
                                  difficulty: event.target.value
                                    ? (event.target.value as SheetAnswerItem["difficulty"])
                                    : undefined,
                                })
                              }
                            >
                              <option value="">{answerDifficultyLabel(undefined)}</option>
                              <option value="low">하</option>
                              <option value="medium">중</option>
                              <option value="high">상</option>
                            </select>
                            <textarea
                              aria-label={`${item.questionNumber || "답안"} 풀이`}
                              value={item.explanation}
                              onChange={(event) => updateAnswer(item.id, { explanation: event.target.value })}
                            />
                            <textarea
                              aria-label={`${item.questionNumber || "답안"} 문제별 메모`}
                              value={item.notes ?? ""}
                              onChange={(event) => updateAnswer(item.id, { notes: event.target.value })}
                              placeholder="문제별 메모"
                            />
                            <button type="button" className="btn-icon danger btn-sm-text" onClick={() => removeAnswer(item.id)}>
                              삭제
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {figures.length > 0 && (
                    <div className="import-answer-preview">
                      <h4>도표/그림 미리보기</h4>
                      <div className="import-figure-list">
                        {figures.map((figure) => (
                          <div key={figure.id} className="import-figure-row">
                            <strong>{figure.questionNumber || "?"}번</strong>
                            <span>{figure.title || "제목 없음"}</span>
                            <small>{figure.image ? `연결됨: ${figure.image}` : "이미지 연결 실패"}</small>
                            {figure.needsReview && <small className="answer-review-badge">검토 필요</small>}
                            {figure.caption && <p>{figure.caption}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        </div>

        <div className="form-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            취소
          </button>
          <button type="button" className="btn-primary" disabled={!canApply} onClick={apply}>
            {isSolutionMode ? "해설 적용하기" : "폼으로 보내기"}
          </button>
        </div>
      </div>
    </div>
  );
}
