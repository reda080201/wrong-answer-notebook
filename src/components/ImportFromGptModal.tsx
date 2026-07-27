import { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { saveImageFiles } from "../api";
import type {
  AiProviderSettings,
  AiProviderStatus,
  EntryFormData,
  PromptTemplate,
  SheetAnswerItem,
  GptMcpPreferences,
  SheetFigureItem,
  Subject,
  WrongAnswerEntry,
} from "../types";
import { SUBJECTS } from "../types";
import type { SettingsTab } from "./SettingsModal";
import {
  parseAllInOneImport,
  parseImportedStudyText,
  isSafeImportImageFilename,
  readImportFile,
  type ImportedStudyDocument,
  type ImportedStudyText,
  type EntryKindResolution,
} from "../utils/importStudyText";
import {
  isAppCompatibleEntriesJson,
  isConceptKnowledgeJson,
  tryParseConceptKnowledgeText,
} from "../utils/conceptKnowledgeImport";
import { classifyImportValidationIssues, validateImportedStudyData } from "../utils/importValidation";
import {
  normalizeImportAudit,
  parseExpectedQuestionNumbers,
  normalizeRejectedNotes,
  removeRejectedNotes,
  scrubRejectedNotesFromAnswers,
} from "../utils/importAudit";
import { buildMathSolutionPrompt, type GptSolutionApplyMode } from "../utils/gptSolution";
import { cleanQuestionText } from "../utils/textCleanup";
import { parseQuestionText } from "../utils/textLayout";
import ImageField from "./ImageField";
import ConceptImportPreviewModal from "./ConceptImportPreviewModal";
import ImportEntriesPreviewModal from "./ImportEntriesPreviewModal";
import { cloneEntryDraft, mergeEntryDraft } from "../features/entries/model/entryDraft";
import { IMPORT_LIMITS } from "../features/import/services/importLimits";
import { readZipImport } from "../features/import/services/zipImport";
import { applyAutomaticFigurePreference } from "../features/figures/services/figureRepresentation";
import { collectEntryImportImageReferences, mapEntryImportImageReferences } from "../utils/importImageReferences";
import Dialog from "../shared/ui/Dialog";
import FigureComparisonPanel from "../features/figures/components/FigureComparisonPanel";
import { normalizeImportImageKey } from "../utils/importImageReferences";

interface ImportFromGptModalProps {
  onClose: () => void;
  onApply: (data: Partial<EntryFormData>, applyMode?: GptSolutionApplyMode, assetFiles?: File[]) => void;
  onApplyEntries?: (entries: Partial<EntryFormData>[], assetFiles?: File[]) => Promise<void> | void;
  fallbackSubject: Subject;
  promptTemplates?: PromptTemplate[];
  aiProvider?: AiProviderSettings;
  aiProviderStatus?: AiProviderStatus | null;
  onGenerateWithAi?: (prompt: string, inputText: string, imageFilenames: string[]) => Promise<string>;
  selectedPromptTemplateId?: string;
  onPromptTemplateSelect?: (templateId: string) => void;
  onSavePromptTemplate?: (template: PromptTemplate) => Promise<void>;
  sourceEntry?: WrongAnswerEntry;
  mode?: "import" | "solution";
  onOpenSettings?: (tab?: SettingsTab) => void;
  gptMcpPreferences?: GptMcpPreferences;
}

function cloneDraft(data: Partial<EntryFormData>): Partial<EntryFormData> {
  return cloneEntryDraft(mergeEntryDraft(data));
}

function answerDifficultyLabel(value: SheetAnswerItem["difficulty"]) {
  if (value === "high") return "상";
  if (value === "medium") return "중";
  if (value === "low") return "하";
  return "자동";
}

const imageFileKey = normalizeImportImageKey;

export function entryKindAutoLabel(entryKind: EntryFormData["entryKind"]): string {
  if (entryKind === "lecture") return "특강자료로 자동 판정됨";
  if (entryKind === "concept") return "개념노트로 자동 판정됨";
  if (entryKind === "wrong_answer") return "개별 오답으로 자동 판정됨";
  return "문제지로 자동 판정됨";
}

function isSupportedImageFile(name: string): boolean {
  return /\.(png|jpe?g|webp)$/i.test(name);
}

const MAX_IMPORT_JSON_BYTES = IMPORT_LIMITS.MAX_JSON_BYTES;
const MAX_IMPORT_IMAGE_COUNT = IMPORT_LIMITS.MAX_IMAGE_COUNT;
const MAX_IMPORT_IMAGE_BYTES = IMPORT_LIMITS.MAX_IMAGE_BYTES;
const MAX_IMPORT_TOTAL_IMAGE_BYTES = IMPORT_LIMITS.MAX_UNCOMPRESSED_BYTES;

function withExpectedQuestionNumbers(
  data: Partial<EntryFormData>,
  expectedQuestionNumbers: string[],
): Partial<EntryFormData> {
  if (!expectedQuestionNumbers.length) return data;
  const sourceAudit = data.importAudit;
  const importAudit = normalizeImportAudit(
    {
      expectedQuestionNumbers,
      uncertainQuestionNumbers: sourceAudit?.uncertainQuestionNumbers ?? [],
      handwritingExcluded: sourceAudit?.handwritingExcluded ?? true,
    },
    {
      question: data.question,
      answerKey: data.answerKey,
      figures: data.figures,
    },
  );
  return { ...data, importAudit };
}

function expectedPromptInstruction(expectedQuestionNumbers: string[]): string {
  if (!expectedQuestionNumbers.length) return "";
  return [
    "",
    "추가 사용자 기준:",
    `- 예상 문제 번호는 ${expectedQuestionNumbers.join(", ")} 입니다.`,
    "- 이 번호가 모두 감지되는지 audit.expectedQuestionNumbers와 audit.missingQuestionNumbers에 반드시 반영하세요.",
  ].join("\n");
}

function assertImportJsonSize(name: string, size: number) {
  if (size > MAX_IMPORT_JSON_BYTES) {
    throw new Error(`${name} 파일이 너무 큽니다. JSON은 ${MAX_IMPORT_JSON_BYTES / 1024 / 1024}MB 이하만 가져올 수 있습니다.`);
  }
}

function assertImportImages(files: File[]) {
  if (files.length > MAX_IMPORT_IMAGE_COUNT) {
    throw new Error(`이미지가 너무 많습니다. 한 번에 ${MAX_IMPORT_IMAGE_COUNT}개 이하만 가져올 수 있습니다.`);
  }
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_IMPORT_TOTAL_IMAGE_BYTES) {
    throw new Error(`이미지 전체 용량이 너무 큽니다. 전체 ${MAX_IMPORT_TOTAL_IMAGE_BYTES / 1024 / 1024}MB 이하만 가져올 수 있습니다.`);
  }
  const oversized = files.find((file) => file.size > MAX_IMPORT_IMAGE_BYTES);
  if (oversized) {
    throw new Error(`${oversized.name} 파일이 너무 큽니다. 이미지는 파일당 ${MAX_IMPORT_IMAGE_BYTES / 1024 / 1024}MB 이하만 가져올 수 있습니다.`);
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
  onApplyEntries,
  fallbackSubject,
  promptTemplates = [],
  aiProvider,
  aiProviderStatus,
  onGenerateWithAi,
  selectedPromptTemplateId,
  onPromptTemplateSelect,
  onSavePromptTemplate,
  sourceEntry,
  mode = "import",
  onOpenSettings,
  gptMcpPreferences,
}: ImportFromGptModalProps) {
  const importReviewExpanded = gptMcpPreferences?.importReviewExpanded ?? true;
  const importDetailOpen = !(gptMcpPreferences?.importDetailCollapsedByDefault ?? true);
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
  const [assetFiles, setAssetFiles] = useState<File[]>([]);
  const [entryKindResolution, setEntryKindResolution] = useState<EntryKindResolution | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [batchImport, setBatchImport] = useState<ImportedStudyDocument | null>(null);
  const [confirmedValidationErrors, setConfirmedValidationErrors] = useState(false);
  const [expectedQuestionInput, setExpectedQuestionInput] = useState("");
  const [dismissedConceptPreviewKey, setDismissedConceptPreviewKey] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ phase: string; completed: number; total: number } | null>(null);
  const [figureComparisonReady, setFigureComparisonReady] = useState<Record<string, boolean>>({});
  const zipAbortRef = useRef<AbortController | null>(null);
  const conceptImportValue = useMemo(() => {
    if (batchImport || draftOverride || zipProgress) return null;
    const parsedValue = tryParseConceptKnowledgeText(rawText);
    if (!parsedValue) return null;
    return isConceptKnowledgeJson(parsedValue) || isAppCompatibleEntriesJson(parsedValue)
      ? parsedValue
      : null;
  }, [batchImport, draftOverride, rawText, zipProgress]);
  const conceptImportKey = conceptImportValue ? rawText : "";
  const shouldShowConceptPreview = Boolean(
    conceptImportValue &&
    onApplyEntries &&
    conceptImportKey !== dismissedConceptPreviewKey,
  );

  const parsed: ImportedStudyText | null = useMemo(() => {
    if (conceptImportValue || batchImport || draftOverride || zipProgress) return null;
    if (!rawText.trim()) return null;
    return parseImportedStudyText(rawText, filename, fallbackSubject);
  }, [batchImport, conceptImportValue, draftOverride, fallbackSubject, filename, rawText, zipProgress]);
  const expectedQuestionParse = useMemo(
    () => parseExpectedQuestionNumbers(expectedQuestionInput),
    [expectedQuestionInput],
  );
  const expectedQuestionNumbers = useMemo(
    () => (expectedQuestionParse.error ? [] : expectedQuestionParse.numbers),
    [expectedQuestionParse],
  );

  useEffect(() => {
    setActivePromptId(defaultPromptId);
  }, [defaultPromptId]);

  useEffect(() => {
    const nextDraft = draftOverride ? cloneDraft(draftOverride) : parsed ? cloneDraft(parsed.data) : null;
    setDraft(nextDraft ? withExpectedQuestionNumbers(nextDraft, expectedQuestionNumbers) : null);
  }, [draftOverride, expectedQuestionNumbers, parsed]);

  useEffect(() => {
    if (!draftOverride && !batchImport) {
      setEntryKindResolution(parsed?.entryKindResolution ?? null);
    }
  }, [batchImport, draftOverride, parsed]);

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
        setBatchImport(null);
        setEntryKindResolution(null);
        setImportWarnings([]);
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
  const activePromptContent = `${activePrompt?.content ?? ""}${expectedPromptInstruction(expectedQuestionNumbers)}`;
  const question = draft?.question ?? "";
  const answerKey = draft?.answerKey ?? [];
  const figures = draft?.figures ?? [];
  const hasMemo = Boolean(draft?.memo?.trim());
  const questionBlocks = useMemo(() => parseQuestionText(question), [question]);
  const questionCount = questionBlocks.filter((block) => block.kind === "question").length;
  const validationReport = useMemo(() => (draft ? validateImportedStudyData(draft) : null), [draft]);
  const validationPolicy = useMemo(
    () =>
      validationReport
        ? classifyImportValidationIssues(validationReport)
        : { blocking: [], confirmable: [], other: [] },
    [validationReport],
  );
  const hasBlockingValidationIssues = validationPolicy.blocking.length > 0;
  const hasConfirmableValidationIssues = validationPolicy.confirmable.length > 0;
  const hasDraftContent = draft?.entryKind === "lecture"
    ? Boolean(draft.title?.trim() || draft.question?.trim() || draft.learningBlocks?.length)
    : draft?.entryKind === "concept"
      ? Boolean(draft.title?.trim() || draft.question?.trim())
      : Boolean(draft?.question?.trim());
  const applyBlockReason = useMemo(() => {
    if (!draft?.entryKind) return "항목 종류를 확인해야 합니다.";
    if (!hasDraftContent) return draft.entryKind === "lecture" ? "본문이나 특강 블록이 없습니다." : "본문이나 특강 블록이 없습니다.";
    if (hasBlockingValidationIssues) return "누락 문항 검증 오류가 있습니다.";
    if (hasConfirmableValidationIssues && !confirmedValidationErrors) return "위험 항목 확인 체크가 필요합니다.";
    if (zipProgress) return "ZIP 이미지 연결이 완료되지 않았습니다.";
    return null;
  }, [confirmedValidationErrors, draft, hasBlockingValidationIssues, hasConfirmableValidationIssues, hasDraftContent, zipProgress]);
  const canApply = !applyBlockReason;
  const aiImageFilenames = isSolutionMode && sourceEntry ? sourceEntry.questionImages : images;
  const detectedFormat = draftOverride || batchImport ? "json" : parsed?.detectedFormat;
  const hasAiVisionImages = aiImageFilenames.length > 0;
  const canUseAiProvider = Boolean(
    onGenerateWithAi &&
    aiProvider &&
    aiProvider.enabled &&
    aiProvider.type !== "manual" &&
    aiProviderStatus?.available,
  );
  const canRunTextAiProvider = Boolean(canUseAiProvider && !aiGenerating);
  const canRunVisionAiProvider = Boolean(canUseAiProvider && hasAiVisionImages && !aiGenerating);

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
      setBatchImport(null);
      setEntryKindResolution(null);
      setImportWarnings([]);
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
      await navigator.clipboard.writeText(activePromptContent);
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
      setBatchImport(null);
      setEntryKindResolution(null);
      setImportWarnings([]);
      setError(null);
      setCopyMessage("클립보드에서 가져왔습니다.");
    } catch {
      setError("클립보드에서 읽지 못했습니다. GPT 답변을 직접 붙여넣어 주세요.");
    }
  };

  const generateWithAiProvider = async (mode: "text" | "vision") => {
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
      if (mode === "vision" && !hasAiVisionImages) {
        throw new Error("Gemini Vision을 사용하려면 먼저 문제/답안지 이미지를 첨부해 주세요.");
      }
      const aiText = await onGenerateWithAi(activePromptContent, inputText, mode === "vision" ? aiImageFilenames : []);
      const conceptValue = tryParseConceptKnowledgeText(aiText);
      if (conceptValue && (isConceptKnowledgeJson(conceptValue) || isAppCompatibleEntriesJson(conceptValue))) {
        setRawText(aiText);
        setFilename("gemini.json");
        setDraftOverride(null);
        setBatchImport(null);
        setEntryKindResolution(null);
        setImportWarnings([]);
        setDismissedConceptPreviewKey("");
        setCopyMessage("AI provider 개념 자료 JSON을 가져왔습니다.");
        return;
      }
      const parsedText = parseImportedStudyText(aiText, "gemini.json", fallbackSubject);
      if (parsedText.detectedFormat !== "json") {
        throw new Error("Gemini 응답이 순수 JSON 객체가 아닙니다.");
      }
      validateImportedStudyData(parsedText.data);
      setRawText(aiText);
      setFilename("gemini.json");
      setDraftOverride(null);
      setBatchImport(null);
      setEntryKindResolution(null);
      setImportWarnings([]);
      setCopyMessage("AI provider 결과를 가져왔습니다.");
    } catch (aiError) {
      setError(
        `${
          aiError instanceof Error && aiError.message
            ? aiError.message
            : "AI provider 호출에 실패했습니다."
        } 이번 호출만 실패했으며 설정은 유지됩니다. manual 붙여넣기를 사용할 수 있습니다.`,
      );
    } finally {
      setAiGenerating(false);
    }
  };

  const collectAllInOneFiles = async (files: File[]) => {
    const zipFile = files.find((file) => file.name.toLowerCase().endsWith(".zip"));
    if (zipFile) {
      const controller = new AbortController();
      zipAbortRef.current = controller;
      const result = await readZipImport(zipFile, { signal: controller.signal, onProgress: setZipProgress });
      assertImportImages(result.imageFiles);
      assertImportJsonSize(result.jsonName, new Blob([result.jsonText]).size);
      return result;
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

  const buildAllInOneDocument = async (
    jsonText: string,
    jsonName: string,
    imageFiles: File[],
  ): Promise<ImportedStudyDocument> => {
    const imported = parseAllInOneImport(jsonText, jsonName, fallbackSubject);
    const imageKeys = imageFiles.map((file) => imageFileKey(file.name));
    const duplicateKey = imageKeys.find((key, index) => imageKeys.indexOf(key) !== index);
    if (duplicateKey) throw new Error(`중복된 이미지 파일명이 있습니다: ${duplicateKey}`);
    const imageByName = new Map(imageFiles.map((file) => [imageFileKey(file.name), file]));
    const filesToSave: File[] = [];
    const fileIndexByKey = new Map<string, number>();
    const warnings: string[] = [];

    for (const [entryIndex, entry] of imported.entries.entries()) {
      const allReferenced = collectEntryImportImageReferences(entry);
      const unsafeReference = allReferenced.find((image) => !isSafeImportImageFilename(image));
      if (unsafeReference) throw new Error(`JSON의 이미지 참조 \`${unsafeReference}\`가 안전한 파일명이 아닙니다.`);
      const referenced = allReferenced;
      for (const image of referenced) {
        const key = imageFileKey(image);
        const file = imageByName.get(key);
        if (!file) {
          if (entry.entryKind === "lecture") {
            warnings.push(`entries[${entryIndex}]에서 참조한 이미지 \`${image}\`를 찾지 못해 연결을 해제했습니다.`);
            continue;
          }
          throw new Error(`JSON에서 참조한 이미지 \`${image}\`를 찾을 수 없습니다.`);
        }
        if (fileIndexByKey.has(key)) continue;
        fileIndexByKey.set(key, filesToSave.length);
        filesToSave.push(file);
      }
    }

    return {
      ...imported,
      assetFiles: filesToSave,
      warnings: [...(imported.warnings ?? []), ...warnings],
      entries: imported.entries.map((entry) => ({
        ...entry,
        ...mapEntryImportImageReferences(entry, (image) => {
          if (!isSafeImportImageFilename(image)) return undefined;
          return fileIndexByKey.has(imageFileKey(image)) ? image : undefined;
        }, { removeUnmapped: true }),
      })),
    };
  };

  const handleAllInOneFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    setError(null);
    setZipProgress({ phase: "inspect", completed: 0, total: 0 });
    try {
      const { jsonText, jsonName, imageFiles } = await collectAllInOneFiles(files);
      const linkedDocument = await buildAllInOneDocument(jsonText, jsonName, imageFiles);
      setRawText(jsonText);
      setFilename(jsonName);
      if (linkedDocument.entries.length === 1) {
        setBatchImport(null);
        setDraftOverride(linkedDocument.entries[0]);
        setAssetFiles(linkedDocument.assetFiles ?? []);
        setEntryKindResolution(linkedDocument.entryKindResolutions?.[0] ?? null);
      } else {
        if (!onApplyEntries) throw new Error("이 화면에서는 여러 항목 저장을 지원하지 않습니다.");
        setDraftOverride(null);
        setAssetFiles([]);
        setEntryKindResolution(null);
        setBatchImport(linkedDocument);
      }
      setImportWarnings(linkedDocument.warnings ?? []);
      const figureCount = linkedDocument.entries.reduce(
        (sum, entry) => sum + (entry.figures?.length ?? 0),
        0,
      );
      setCopyMessage(`올인원 가져오기 완료: ${linkedDocument.entries.length}개 항목 · 도표/그림 ${figureCount}개 감지`);
    } catch (allInOneError) {
      setError(allInOneError instanceof DOMException && allInOneError.name === "AbortError" ? "가져오기를 취소했습니다." : allInOneError instanceof Error ? allInOneError.message : "올인원 파일을 가져오지 못했습니다.");
    } finally {
      zipAbortRef.current = null;
      setZipProgress(null);
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

  const updateFigure = (id: string, patch: Partial<SheetFigureItem>) => {
    setDraft((current) => ({
      ...current,
      figures: (current?.figures ?? []).map((figure) =>
        figure.id === id ? { ...figure, ...patch } : figure,
      ),
    }));
    setConfirmedValidationErrors(false);
  };

  const removeFigure = (id: string) => {
    setDraft((current) => ({
      ...current,
      figures: (current?.figures ?? []).filter((figure) => figure.id !== id),
    }));
    setConfirmedValidationErrors(false);
  };

  const apply = () => {
    if (!draft || !canApply) {
      setError(applyBlockReason ?? "가져오기 항목을 확인해 주세요.");
      return;
    }
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
    const finalPolicy = classifyImportValidationIssues(validateImportedStudyData(normalizedDraft));
    if (finalPolicy.blocking.length > 0) {
      setError("누락 문제가 있어 적용할 수 없습니다. 본문/JSON을 수정하거나 다시 가져와 주세요.");
      return;
    }
    if (finalPolicy.confirmable.length > 0 && !confirmedValidationErrors) {
      setError("손글씨/도표 연결 위험 항목을 확인한 뒤 체크박스를 선택해야 적용할 수 있습니다.");
      return;
    }
    const nextData = {
      ...normalizedDraft,
      questionImages: isSolutionMode
        ? sourceEntry?.questionImages ?? []
        : [...new Set([...(draft.questionImages ?? []), ...images])],
    };
    if (!isSolutionMode && assetFiles.length > 0) {
      onApply(nextData, undefined, assetFiles);
    } else {
      onApply(nextData, isSolutionMode ? applyMode : undefined);
    }
  };

  return (
    <>
      <Dialog open onClose={onClose} className="form-modal form-modal--wide import-modal" ariaLabel={isSolutionMode ? "GPT 해설 빠른 가져오기" : "GPT 결과 가져오기"} closeDisabled={aiGenerating} busy={aiGenerating}>
        <div className="form-header import-modal-header">
          <h2 id="import-modal-title">{isSolutionMode ? "GPT 해설 빠른 가져오기" : "GPT 결과 가져오기"}</h2>
          <div className="import-modal-header-actions">
            <button type="button" className="btn-secondary btn-sm" onClick={() => setHelpOpen(true)}>
              가져오기 도움말
            </button>
            {onOpenSettings && (
              <button type="button" className="btn-secondary btn-sm" onClick={() => onOpenSettings("gpt-mcp")}>
                설정
              </button>
            )}
            <button type="button" className="btn-icon" onClick={onClose} aria-label="닫기">
              닫기
            </button>
          </div>
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
                          onClick={() => generateWithAiProvider("text")}
                          disabled={!canRunTextAiProvider}
                          title={
                            !canUseAiProvider
                              ? "manual provider 또는 API 비활성 상태입니다."
                              : "이미지 없이 현재 텍스트만 Gemini provider로 정리합니다."
                          }
                        >
                          {aiGenerating ? "AI 가져오는 중..." : "텍스트 AI 정리"}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => generateWithAiProvider("vision")}
                          disabled={!canRunVisionAiProvider}
                          title={
                            !canUseAiProvider
                              ? "manual provider 또는 API 비활성 상태입니다."
                              : !hasAiVisionImages
                                ? "Gemini Vision 분석에는 첨부 이미지가 필요합니다."
                                : "이미지와 텍스트를 함께 Gemini provider로 분석합니다."
                          }
                        >
                          {aiGenerating ? "AI 가져오는 중..." : "이미지 AI 분석"}
                        </button>
                      </div>
                    </div>
                  </div>
                  <pre>{activePromptContent}</pre>
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
                <label htmlFor="expected-question-numbers">예상 문제 번호</label>
                <input
                  id="expected-question-numbers"
                  value={expectedQuestionInput}
                  onChange={(event) => {
                    setExpectedQuestionInput(event.target.value);
                    setConfirmedValidationErrors(false);
                  }}
                  placeholder="예: 1-20 또는 1,2,3,5"
                />
                <p className={expectedQuestionParse.error ? "image-field-error" : "form-hint"}>
                  {expectedQuestionParse.error
                    ? expectedQuestionParse.error
                    : expectedQuestionNumbers.length
                      ? `사용자 기준 ${expectedQuestionNumbers.length}개 문항으로 누락을 검사합니다.`
                      : "비워두면 GPT/Gemini가 만든 audit 기준을 사용합니다."}
                </p>
              </div>

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
                    setBatchImport(null);
                    setEntryKindResolution(null);
                    setImportWarnings([]);
                    setError(null);
                  }}
                  placeholder={isSolutionMode ? "ChatGPT가 만든 해설 JSON을 붙여넣으세요." : "GPT가 사진에서 변환한 시험지 텍스트나 JSON을 붙여넣으세요."}
                />
                {conceptImportValue && (
                  <p className="form-hint import-concept-detected">
                    개념 자료 JSON으로 감지되었습니다. 개념노트 또는 특강자료로 변환해 저장할 수 있습니다.
                  </p>
                )}
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
                  {zipProgress && (
                    <div className="import-zip-progress" role="status" aria-live="polite">
                      <span>{zipProgress.phase === "inspect" ? "ZIP 검사 중…" : `이미지 확인 중 ${zipProgress.completed} / ${zipProgress.total}`}</span>
                      <button type="button" className="btn-secondary btn-sm" onClick={() => zipAbortRef.current?.abort()}>취소</button>
                    </div>
                  )}
                </div>
              )}

              <div className="import-json-example">
                <span>권장 JSON 예시</span>
                <p className="form-hint">
                  answerKey의 concepts, strategy, steps, wrongPoint, reviewPoint와 diagramSpec, learningBlocks는 학습 내용칸 카드에 바로 반영됩니다. 도표 문항은 figures 설명만 쓰지 말고 가능한 경우 learningBlocks[].type을 "diagram"으로 만들며, raw SVG/HTML/Canvas/base64는 넣지 마세요.
                  개념 자료는 가능하면 entries 배열 또는 lecture JSON으로 출력하고, nested units 구조를 쓸 때는 schemaVersion: "concept-knowledge-v1", sourceType: "concept_knowledge_base"를 포함하세요.
                </p>
                <pre>{`{
  "entries": [
    {
      "entryKind": "concept",
      "title": "윤리학",
      "subject": "사회",
      "question": "인간 행위의 옳고 그름을 탐구하는 학문",
      "memo": "시험 포인트와 오답 함정을 정리",
      "tags": ["사회", "생활과 윤리", "윤리학"],
      "learningBlocks": [
        { "type": "concept", "title": "윤리학", "content": "인간 행위의 옳고 그름을 탐구한다." }
      ]
    }
  ]
}

또는

{
  "entryKind": "lecture",
  "title": "생활과 윤리 1단원 특강",
  "subject": "사회",
  "sourceType": "json",
  "learningBlocks": [
    { "type": "concept", "title": "핵심 개념", "content": "..." }
  ]
}

시험지 예시:
{
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
      "strategy": "조건을 식으로 바꾸고 그래프 교점을 확인",
      "steps": ["조건을 정리한다", "함숫값을 대입한다", "보기와 비교한다"],
      "choiceJudgements": [
        { "marker": "①", "text": "조건 A를 만족하지 않음" }
      ],
      "wrongPoint": "그래프 교점을 x절편으로 착각하기 쉬움",
      "reviewPoint": "교점과 절편의 차이를 다시 확인",
      "notes": "이 문항에서만 다시 볼 메모",
      "importantPoints": ["보기 ②와 ③의 차이 확인"],
      "concepts": ["함수"],
      "diagramSpec": {
        "diagramType": "geometry-helper",
        "title": "원과 직선 시각화",
        "params": {
          "coordinatePlane": true,
          "objects": [
            { "type": "circle", "center": [0, 0], "radius": 2, "label": "x^2+y^2=4" },
            { "type": "line", "equation": "y=tx+t", "label": "y=tx+t" }
          ],
          "points": [
            { "id": "P", "role": "upper intersection" },
            { "id": "Q", "role": "lower intersection" }
          ],
          "segments": [
            { "from": "P", "to": "R", "style": "horizontal", "label": "PR" },
            { "from": "Q", "to": "S", "style": "horizontal", "label": "QS" }
          ],
          "highlight": ["PR", "QS"],
          "coreIdea": "수평현 길이 차를 교점의 x좌표 차로 바꾸어 극한을 계산한다."
        }
      },
      "needsReview": false,
      "sourceNote": "답안지 1번과 연결"
    }
  ],
  "learningBlocks": [
    {
      "type": "diagram",
      "title": "좌표 그래프 시각화",
      "content": "그래프의 교점과 절편을 구분한다.",
      "sourceQuestionNumber": "1",
      "diagramType": "geometry-helper",
      "diagramSpec": {
        "diagramType": "geometry-helper",
        "title": "원과 직선 시각화",
        "params": {
          "objects": [
            { "type": "circle", "center": [0, 0], "radius": 2, "label": "x^2+y^2=4" },
            { "type": "line", "equation": "y=tx+t", "label": "y=tx+t" }
          ],
          "highlight": ["PR", "QS"],
          "coreIdea": "교점과 수평현 길이를 연결한다."
        }
      }
    }
  ],
  "figures": [
    {
      "questionNumber": "1",
      "title": "1번 그래프",
      "caption": "x축과 y축의 교점이 표시된 그래프",
      "image": "",
      "source": "described_only",
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
              {!draft ? (
                <div className="import-preview-empty">붙여넣기 또는 파일 업로드를 하면 미리보기가 표시됩니다.</div>
              ) : (
                <>
                  <div className="import-entry-kind-field">
                    <label htmlFor="import-entry-kind">항목 종류</label>
                    <select
                      id="import-entry-kind"
                      value={draft.entryKind ?? ""}
                      onChange={(event) => {
                        const value = event.target.value as EntryFormData["entryKind"];
                        setDraft((current) => current ? { ...current, entryKind: value } : current);
                        setEntryKindResolution({ entryKind: value, source: "explicit" });
                        setConfirmedValidationErrors(false);
                      }}
                    >
                      <option value="problem_sheet">문제지</option>
                      <option value="wrong_answer">개별 오답</option>
                      <option value="concept">개념노트</option>
                      <option value="lecture">특강자료</option>
                    </select>
                    {entryKindResolution?.source === "heuristic" && <span className="import-auto-kind-badge">{entryKindAutoLabel(entryKindResolution.entryKind)}</span>}
                  </div>
                  {importWarnings.length > 0 && (
                    <div className="import-asset-warnings" role="alert">
                      <strong>이미지 연결 확인</strong>
                      <ul>{importWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                    </div>
                  )}
                  {validationReport?.audit && (
                    <div className={`import-audit-summary ${validationReport.issues.some((issue) => issue.severity === "error") ? "import-audit-summary--danger" : ""}`} role="alert">
                      <strong>
                        AI 판독 감사
                        {expectedQuestionNumbers.length > 0 && <span className="import-user-expected-badge">사용자 기준</span>}
                      </strong>
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
                  {detectedFormat && detectedFormat !== "json" && (
                    <div className="import-format-warning" role="alert">
                      JSON이 아닌 텍스트로 감지되었습니다. GPT 프롬프트를 다시 복사해 순수 JSON 객체로 받아오면 답안지와 난이도 연결이 더 정확합니다.
                    </div>
                  )}
                  <dl className="import-preview-meta">
                    <div>
                      <dt>형식</dt>
                      <dd>{detectedFormat === "json" ? "JSON" : "텍스트"}</dd>
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
                    <details className="import-validation-report" open={importReviewExpanded}>
                      <summary>검토 이슈</summary>
                      {validationPolicy.blocking.length > 0 && (
                        <div className="import-validation-section import-validation-section--blocking">
                          <strong>적용 불가</strong>
                          <p>누락 문제를 해결해야 적용할 수 있습니다. 본문/JSON을 수정하거나 다시 가져와 주세요.</p>
                          {expectedQuestionNumbers.length > 0 && <p>사용자 입력 기준 누락이 감지되었습니다.</p>}
                          {validationPolicy.blocking.slice(0, 6).map((issue) => (
                            <p key={issue.id} className="import-validation-issue import-validation-issue--error">
                              {issue.message}
                            </p>
                          ))}
                        </div>
                      )}
                      {validationPolicy.confirmable.length > 0 && (
                        <div className="import-validation-section import-validation-section--confirmable">
                          <strong>확인 후 적용 가능</strong>
                          {validationPolicy.confirmable.slice(0, 6).map((issue) => (
                            <p key={issue.id} className="import-validation-issue import-validation-issue--error">
                              {issue.message}
                            </p>
                          ))}
                        </div>
                      )}
                      {validationPolicy.other.slice(0, 8).map((issue) => (
                        <p key={issue.id} className={`import-validation-issue import-validation-issue--${issue.severity}`}>
                          {issue.message}
                        </p>
                      ))}
                    </details>
                  )}

                  {!hasBlockingValidationIssues && hasConfirmableValidationIssues && (
                    <label className="settings-checkbox import-danger-confirm">
                      <input
                        type="checkbox"
                        checked={confirmedValidationErrors}
                        onChange={(event) => setConfirmedValidationErrors(event.target.checked)}
                      />
                      손글씨/도표 연결 위험 항목을 확인했습니다.
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
                            <details className="import-answer-details" open={importDetailOpen}>
                              <summary>상세 편집</summary>
                            <textarea
                              aria-label={`${item.questionNumber || "답안"} 풀이 전략`}
                              value={item.strategy ?? ""}
                              onChange={(event) => updateAnswer(item.id, { strategy: event.target.value })}
                              placeholder="풀이 전략"
                            />
                            <textarea
                              aria-label={`${item.questionNumber || "답안"} 풀이 단계`}
                              value={(item.steps ?? []).join("\n")}
                              onChange={(event) =>
                                updateAnswer(item.id, {
                                  steps: event.target.value
                                    .split(/\r?\n/)
                                    .map((step) => step.trim())
                                    .filter(Boolean),
                                })
                              }
                              placeholder="한 줄에 한 단계"
                            />
                            <textarea
                              aria-label={`${item.questionNumber || "답안"} 보기별 판단`}
                              value={(item.choiceJudgements ?? [])
                                .map((judgement) => [judgement.marker, judgement.text].filter(Boolean).join(": "))
                                .join("\n")}
                              onChange={(event) =>
                                updateAnswer(item.id, {
                                  choiceJudgements: event.target.value
                                    .split(/\r?\n/)
                                    .map((line) => {
                                      const match = line.match(/^\s*([^:：]{1,12})[:：]\s*(.+)$/);
                                      return match
                                        ? { marker: match[1].trim(), text: match[2].trim() }
                                        : { marker: "", text: line.trim() };
                                    })
                                    .filter((judgement) => judgement.text),
                                })
                              }
                              placeholder="①: 조건 불만족"
                            />
                            <textarea
                              aria-label={`${item.questionNumber || "답안"} 오답 포인트`}
                              value={item.wrongPoint ?? ""}
                              onChange={(event) => updateAnswer(item.id, { wrongPoint: event.target.value })}
                              placeholder="오답 포인트"
                            />
                            <textarea
                              aria-label={`${item.questionNumber || "답안"} 복습 포인트`}
                              value={item.reviewPoint ?? ""}
                              onChange={(event) => updateAnswer(item.id, { reviewPoint: event.target.value })}
                              placeholder="복습 포인트"
                            />
                            <textarea
                              aria-label={`${item.questionNumber || "답안"} 문제별 메모`}
                              value={item.notes ?? ""}
                              onChange={(event) => updateAnswer(item.id, { notes: event.target.value })}
                              placeholder="문제별 메모"
                            />
                            </details>
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
                            <small>
                              {figure.image
                                ? `연결됨: ${figure.image}`
                                : figure.source === "described_only"
                                  ? "설명 도표"
                                  : "이미지 나중에 연결"}
                            </small>
                            {figure.needsReview && <small className="answer-review-badge">검토 필요</small>}
                            {figure.caption && <p>{figure.caption}</p>}
                            {(figure.original || figure.cleaned || figure.semanticSpec) && (
                              <>
                                <div className="import-figure-actions" aria-label={`${figure.questionNumber || "?"}번 그림 표현`}>
                                  <span>원본 {figure.original?.image ? "있음" : "없음"}</span>
                                  <span>GPT 정리본 {figure.cleaned?.image ? "있음" : "없음"}</span>
                                  <span>구조 데이터 {figure.semanticSpec ? "있음" : "없음"}</span>
                                </div>
                                <div className="import-figure-actions">
                                  {figure.original?.image && <button type="button" className="btn-secondary btn-sm" disabled={!figureComparisonReady[figure.id]} title={!figureComparisonReady[figure.id] ? "원본과 정리본 비교가 끝난 뒤 선택할 수 있습니다." : undefined} onClick={() => updateFigure(figure.id, { preferredRepresentation: "original", representationSelectionSource: "user", verification: { ...(figure.verification ?? { status: "needs_review", confidence: 0, checks: {}, blockingIssues: [], warnings: [] }), userApproved: true, verificationSource: "user", verifiedAt: new Date().toISOString() }, needsReview: false })}>원본 사용</button>}
                                  {figure.cleaned?.image && <button type="button" className="btn-secondary btn-sm" disabled={!figureComparisonReady[figure.id]} title={!figureComparisonReady[figure.id] ? "원본과 정리본 비교가 끝난 뒤 승인할 수 있습니다." : undefined} onClick={() => updateFigure(figure.id, { preferredRepresentation: "cleaned", representationSelectionSource: "user", verification: { ...(figure.verification ?? { status: "needs_review", confidence: 0, checks: {}, blockingIssues: [], warnings: [] }), userApproved: true, verificationSource: "user", verifiedAt: new Date().toISOString() }, needsReview: false, image: figure.cleaned?.image, source: "gpt_cleaned" })}>GPT 정리본 승인</button>}
                                  {figure.semanticSpec && <button type="button" className="btn-secondary btn-sm" disabled={!figureComparisonReady[figure.id]} title={!figureComparisonReady[figure.id] ? "구조 렌더링 비교가 끝난 뒤 선택할 수 있습니다." : undefined} onClick={() => updateFigure(figure.id, { preferredRepresentation: "semantic_render", representationSelectionSource: "user", verification: { ...(figure.verification ?? { status: "needs_review", confidence: 0, checks: {}, blockingIssues: [], warnings: [] }), userApproved: true, verificationSource: "user", verifiedAt: new Date().toISOString() } })}>구조 렌더링 사용</button>}
                                  <button type="button" className="btn-secondary btn-sm" onClick={() => updateFigure(figure.id, applyAutomaticFigurePreference({ ...figure, representationSelectionSource: "automatic", preferredRepresentation: undefined }))}>자동 선택 다시 적용</button>
                                </div>
                                {figure.verification && <small>검증 {Math.round(figure.verification.confidence * 100)}% · 차단 {figure.verification.blockingIssues.length}건 · 경고 {figure.verification.warnings.length}건</small>}
                                <FigureComparisonPanel figure={figure} onReady={(ready) => setFigureComparisonReady((current) => current[figure.id] === ready ? current : { ...current, [figure.id]: ready })} />
                              </>
                            )}
                            {!figure.image && (
                              <div className="import-figure-actions">
                                <button
                                  type="button"
                                  className="btn-secondary btn-sm"
                                  onClick={() =>
                                    updateFigure(figure.id, {
                                      source: "described_only",
                                      image: undefined,
                                      needsReview: false,
                                    })
                                  }
                                >
                                  설명 도표로 유지
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary btn-sm"
                                  onClick={() =>
                                    updateFigure(figure.id, {
                                      image: undefined,
                                      needsReview: true,
                                    })
                                  }
                                >
                                  이미지 나중에 연결
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary btn-sm danger"
                                  onClick={() => removeFigure(figure.id)}
                                >
                                  도표 항목 제외
                                </button>
                              </div>
                            )}
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
        {!canApply && applyBlockReason && (
          <p className="import-apply-reason" role="status">{applyBlockReason}</p>
        )}
        <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} className="import-help-dialog" backdropClassName="import-help-backdrop" ariaLabel="가져오기 도움말">
              <header><h3 id="import-help-title">가져오기 도움말</h3><button type="button" aria-label="가져오기 도움말 닫기" onClick={() => setHelpOpen(false)}>닫기</button></header>
              <ul>
                <li>프롬프트를 복사해 GPT 결과를 JSON으로 받은 뒤 붙여넣습니다.</li>
                <li>텍스트 파일, JSON, ZIP과 이미지 묶음도 가져올 수 있습니다.</li>
                <li>AI 판독 감사와 needsReview는 저장 전에 직접 확인해야 하는 항목입니다.</li>
                <li>손글씨 제외 여부와 원본/정리된 그림 연결 상태를 확인하세요.</li>
                <li>저장 전 미리보기에서 문제·정답·해설이 섞이지 않았는지 검토하세요.</li>
              </ul>
        </Dialog>
      </Dialog>
      {shouldShowConceptPreview && conceptImportValue && onApplyEntries && (
        <ConceptImportPreviewModal
          value={conceptImportValue}
          fallbackSubject={fallbackSubject}
          onClose={() => setDismissedConceptPreviewKey(conceptImportKey)}
          onApplyEntries={async (entries) => {
            await onApplyEntries(entries);
            onClose();
          }}
        />
      )}
      {batchImport && onApplyEntries && (
        <ImportEntriesPreviewModal
          document={batchImport}
          onClose={onClose}
          onApplyEntries={onApplyEntries}
        />
      )}
    </>
  );
}
