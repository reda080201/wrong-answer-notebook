import type { MemoTemplate, PromptTemplate } from "../../types";

/** Shared GUI import contract. The parser may still accept older v2 payloads. */
export const PROBLEM_SHEET_IMPORT_V3_PROMPT = `GUI import contract v3:
Return one JSON object with entries[].questions[] as the external question list. Each question may include questionNumber, questionText, contentSegments, choices, conditions, equations, answer, figures, questionSourceCrops and sourcePageImages. Preserve answerKey, learningBlocks, rejectedNotes and audit at their original levels.
The application canonicalizes entries[].questions[] into internal structuredQuestions; do not invent a canonical item when the number is unknown. Keep uncertain numbers in audit. Preserve every source crop and original/cleaned figure reference exactly, including cleaned.generatedBy values gpt, deterministic_cleanup, or deterministic_redraw. A renderedQuestionPng is a derived app artifact and must never be treated as a source crop.
Model self-checks (gpt_self_check and second_pass_model) are needs_review, not trusted. Only an explicit user verification or a qualified local_validator with no blocking issue may be trusted. Do not auto-approve based on confidence alone. All referenced ZIP assets must exist and paths must be relative, non-absolute, and traversal-free.`;

export const builtInPromptTemplates: PromptTemplate[] = [
  {
    id: "builtin-sheet-png-package",
    name: "시험지+답안지+PNG 패키지",
    builtIn: true,
    content: `${PROBLEM_SHEET_IMPORT_V3_PROMPT}

사진 속 문제지와 답안지를 분석해 wrong-answer-notebook-import-v2 형식의 import.json과 실제 PNG/JPG/WebP 자산으로 구성된 패키지를 만들어줘.

표준 출력은 반드시 다음 wrapper 구조를 따른다.
{
  "schemaVersion": "wrong-answer-notebook-import-v2",
  "importType": "problem_sheet",
  "title": "자료 제목",
  "subject": "수학",
  "entries": [{
    "entryKind": "problem_sheet",
    "title": "시험지 제목",
    "subject": "수학",
    "questions": [{ "questionNumber": "1", "questionText": "...", "contentSegments": [], "choices": [], "figures": [], "questionSourceCrops": [] }],
    "answerKey": [],
    "figures": [],
    "learningBlocks": [],
    "rejectedNotes": [],
    "audit": {}
  }]
}

entryKind 규칙: 시험지는 반드시 problem_sheet, 개별 오답은 wrong_answer, 개념노트는 concept, 특강은 lecture다. entries의 모든 항목에 entryKind를 반드시 넣고 importType과 일치시킨다. 여러 종류가 섞이면 importType은 mixed다. import.json의 이미지 파일명은 ZIP 내부 파일명과 대소문자까지 정확히 일치시킨다.

이 모드는 실제 이미지 생성이 가능한 PNG 패키지 모드다. JSON 설명만 작성하지 말고 원본 도형 crop을 입력으로 사용해 cleaned PNG를 생성해라.

도형 처리 순서:
1. 원본 페이지 이미지와 도형별 원본 crop을 보존한다.
2. 각 crop을 image-to-image로 정리해 cleaned PNG를 생성한다. 새 도형으로 재해석하지 말고 구도, 종횡비, 점과 라벨, 선분·곡선·원·축, 수치, 실선·점선, 열린점·닫힌점, 직각·평행·같은 길이 표시, 음영을 유지하고 손글씨와 촬영 노이즈만 제거한다.
3. 원본을 독립적으로 다시 분석해 semanticSpec을 만든다. 모르는 관계는 추측하지 말고 confidence와 warnings를 남긴다.
4. 원본 crop, cleaned PNG, semanticSpec, 문제 본문, 선택지를 독립 재검증해 verification을 작성한다. 생성 단계의 설명을 검증 결과로 복사하지 마라.
5. 모델 confidence만으로 자동 신뢰하지 마라. gpt_self_check와 second_pass_model은 blockingIssues가 없어도 needsReview로 유지한다. 명시적 user 승인 또는 blocking issue가 없고 신뢰 조건을 충족한 local_validator만 cleaned를 자동 선택할 수 있다. 그 외에는 preferredRepresentation="original", image는 original crop 파일명, source="original", needsReview=true로 설정한다.

필수 규칙:
 - import.json은 순수 JSON 객체 하나만 출력하고 base64 이미지, data URL, raw HTML/SVG, script, iframe은 넣지 마라.
- figures[] 배열의 각 항목에 original, cleaned, semanticSpec, verification, preferredRepresentation을 별도 필드로 보존한다. 기존 image/source/needsReview도 반드시 함께 넣어 하위 호환한다.
- cleaned.generatedBy는 실제 입력값을 그대로 보존하며 허용값은 "gpt", "deterministic_cleanup", "deterministic_redraw" 중 하나다. deterministic_cleanup 또는 deterministic_redraw를 gpt로 바꾸지 마라.
- original.crop은 정규화 좌표 {x, y, width, height}이며 x/y는 0 이상 1 이하, width/height는 0 초과 1 이하, x+width와 y+height는 1 이하여야 한다. 범위를 벗어나면 clamp하지 말고 needsReview=true와 구체적인 검증 경고를 남겨라.
- questionSourceCrops[].image와 figures[].original.image/cleaned.image는 원본·정리본 source asset 참조다. 앱이 canonical DOM에서 만든 renderedQuestionPng는 파생 artifact이며 source crop으로 기록하거나 원본을 덮어쓰지 마라.
 - 파일명은 실제 ZIP 파일명과 대소문자까지 일치시킨다. 예: graph_1.png. original.image와 cleaned.image가 있으면 둘 다 ZIP에 포함한다.
- 문제 번호가 불확실하거나 검증에 실패해도 번호를 추측하거나 빈 번호의 import-ready canonical 문항을 만들지 마라. 해당 불확실성은 audit와 review 데이터에 보존한다.
- 손글씨와 학생 풀이 흔적은 문제·답안에 넣지 말고 rejectedNotes에 기록한다.
- audit에는 예상/감지/누락/불확실 번호와 needsReviewCount를 기록한다.
- semanticSpec은 function_graph, coordinate_geometry, plane_geometry, solid_geometry, probability_tree, table, venn_diagram, number_line, sequence_diagram, custom_math_diagram 중 하나를 사용한다.
- answerKey와 learningBlocks의 diagramSpec은 실제 학습에 필요한 경우에만 만든다.

figure 예시:
{
  "id": "figure-1",
  "questionNumber": "1",
  "title": "1번 그래프",
  "caption": "축, 점, 교점과 음영 영역 설명",
  "original": { "image": "q01_figure_original.png", "sourcePageImage": "source_page_001.png", "crop": { "x": 0.1, "y": 0.2, "width": 0.4, "height": 0.3 } },
  "cleaned": { "image": "q01_figure_cleaned.png", "generatedBy": "gpt", "generatedAt": "2026-01-01T00:00:00Z", "sourceImageHash": "sha256:...", "promptVersion": "figure-clean-v1" },
  "semanticSpec": { "type": "function_graph", "points": [], "segments": [], "relations": [], "warnings": [], "confidence": 0.98 },
  "verification": { "status": "verified", "confidence": 0.97, "checks": { "topologyMatch": true, "numericLabelsMatch": true, "visualLayoutPreserved": true }, "blockingIssues": [], "warnings": [], "verifier": "independent-figure-check-v1" },
  "preferredRepresentation": "cleaned",
  "image": "q01_figure_cleaned.png",
  "source": "gpt_cleaned",
  "needsReview": false
}

문제 본문·answerKey·audit·rejectedNotes·learningBlocks도 기존 import 스키마에 맞춰 함께 작성해라. tags와 최상위 difficulty는 만들지 마라.`,
  },
  {
    id: "builtin-sheet-answer-json",
    name: "시험지+답안지 JSON",
    builtIn: true,
    content: `사진 속 문제지와 답안지를 오답노트 앱에 넣을 JSON으로 정리해줘. 이 모드는 JSON 전용이며 이미지를 생성하거나 파일을 첨부하지 않는다.

규칙:
- 최상위 단일 시험지 객체에는 반드시 "entryKind": "problem_sheet"를 넣어줘.
- 반드시 순수 JSON 객체 1개만 출력해줘. 첫 글자는 {, 마지막 글자는 } 이어야 해.
- PNG를 생성하지 말고, 원본 도형의 상세 구조·관계·수치·라벨을 semanticSpec과 caption에 기록해.
- figures[].original에는 필요한 원본 crop과 source page의 파일명 계획만 적고 실제 이미지가 없으면 image를 만들지 마.
- figures[].cleaned에는 생성 예정 파일명, promptVersion, sourceImageHash 계획만 기록할 수 있으며 generatedBy는 gpt로 적지 마. 실제 정리 PNG는 PNG 패키지 모드에서만 만든다.
- 이미지가 제공되지 않았으므로 verification.status는 기본적으로 needs_review, preferredRepresentation은 original, needsReview는 true로 둔다.
- 기존 image/source/needsReview 필드는 유지하되 실제 파일이 없으면 image는 생략하고 source는 described_only로 둔다.
- 설명문, Markdown, 코드블록, \`\`\`json, 파일 첨부 안내 문구는 절대 넣지 마.
- 문제 원문은 question에 줄바꿈을 살려 넣어줘.
- 수식은 일반 텍스트로 흉내 내지 말고 MathText가 해석할 수 있도록 인라인은 $...$, 별도 줄 수식은 $$...$$ LaTeX 구문으로 작성해줘.
- 도표/그래프/표는 빠뜨리지 말고 Markdown 표, 축·범례·값 설명, 또는 [도표/그래프 설명] 블록으로 옮겨줘.
- 손글씨, 밑줄, 별표, 동그라미, 여백 메모, 학생 풀이 흔적은 question, memo, importantNotes, answerKey 어디에도 넣지 말고 rejectedNotes에만 기록해줘.
- audit에는 이미지에서 예상되는 문제 번호, 실제 감지 번호, 누락 번호, 불확실 번호, 손글씨 제외 여부, 검토 필요 개수를 반드시 기록해줘.
- 답안지에 인쇄된 정답·해설·정답 근거는 유지하되, 시험지 위 학생 필기와 구분해줘.
- 시험지 전체에 해당하는 학습 포인트만 importantNotes에 넣어줘.
- 특정 문제에만 해당하는 메모는 importantNotes나 memo에 넣지 말고 반드시 answerKey[].notes에 넣어줘.
- 답안지는 answerKey 배열로 문제 번호, 정답, 풀이, 문제별 메모, 중요 포인트, 개념을 연결해줘.
- 해설에서 특강 카드로 쓸 수 있는 answerKey[].strategy, steps, wrongPoint, reviewPoint, concepts를 가능한 한 구체적으로 채워줘.
- 시각화가 실제 이해에 도움이 되는 경우에만 answerKey[].diagramSpec 또는 learningBlocks[].diagramSpec을 넣어줘. 단순 계산 문제에는 만들지 말고, 한 문항당 최대 1개, 전체 learningBlocks diagram은 최대 3개까지만 허용해.
- raw HTML, raw SVG, base64 이미지, script, iframe 문자열은 절대 넣지 마.
- 수식은 일반 텍스트로 흉내 내지 말고 MathText가 해석할 수 있도록 인라인은 $...$, 별도 줄 수식은 $$...$$ LaTeX 구문으로 작성해줘.
- 왜 틀리기 쉬운지 판단 가능한 경우 mistakeAnalysis.causes에 오답 원인을 넣어줘. 허용 type은 calculation, condition_misread, concept_gap, strategy_gap, time_pressure, choice_trap, careless, unknown 이야.
- 오답 원인은 추측이 약하면 unknown만 쓰거나 causes를 비워둬.
- 난이도는 answerKey[].difficulty에만 넣고, 확실히 판단 가능한 문항에만 "low", "medium", "high" 중 하나로 넣어줘.
- 근거가 부족하면 difficulty 필드를 생략해줘. 모든 문항에 같은 difficulty를 반복해서 채우지 마.
- 답안 번호가 불확실하면 questionNumber를 추측하지 말고 import-ready canonical 문항을 만들지 말며, 불확실성을 audit와 review 데이터에 보존해줘.
- 모르는 값은 추측하지 말고 빈 문자열이나 빈 배열로 둬.
- tags 필드는 만들지 마.
- 최상위 difficulty 필드는 만들지 마.

형식:
{
  "entryKind": "problem_sheet",
  "title": "시험지 제목",
  "subject": "수학",
  "question": "1. ...\\n① ...",
  "importantNotes": ["전체적으로 알아둘 점"],
  "memo": "추가 메모",
  "rejectedNotes": ["학생 필기로 의심되어 제외한 내용"],
  "audit": {
    "expectedQuestionNumbers": ["1"],
    "detectedQuestionNumbers": ["1"],
    "missingQuestionNumbers": [],
    "uncertainQuestionNumbers": [],
    "handwritingExcluded": true,
    "needsReviewCount": 0
  },
  "mistakeAnalysis": {
    "causes": [
      { "type": "concept_gap", "severity": "medium", "note": "핵심 개념 확인 필요" }
    ],
    "primaryCause": "concept_gap",
    "confidence": "gpt",
    "preventionNote": "풀이 전 조건과 개념을 먼저 적기",
    "practiceMode": "concept_review"
  },
  "answerKey": [
    {
      "questionNumber": "1",
      "answer": "③",
      "explanation": "풀이",
      "strategy": "조건을 식으로 바꾸고 그래프를 확인",
      "steps": ["조건 정리", "식 세우기", "정답 검산"],
      "wrongPoint": "교점과 절편을 혼동하기 쉬움",
      "reviewPoint": "다음 복습 때 그래프 표시부터 확인",
      "notes": "이 문항에서만 다시 볼 메모",
      "importantPoints": ["주의할 점"],
      "concepts": ["함수"],
      "needsReview": false,
      "sourceNote": "답안지 1번과 연결"
    }
  ],
  "concepts": ["함수", "그래프"],
  "learningBlocks": []
}`,
  },
  {
    id: "builtin-important-notes",
    name: "중요 포인트 중심",
    builtIn: true,
    content: "문제지와 답안지의 인쇄된 내용만 기준으로, 시험지 전체 핵심은 importantNotes에, 특정 문항 메모는 answerKey[].notes에, 문항별 풀이 포인트는 answerKey[].importantPoints에 정리해줘. 판단 가능한 오답 원인은 mistakeAnalysis.causes에 calculation/condition_misread/concept_gap/strategy_gap/time_pressure/choice_trap/careless/unknown 중에서 넣어줘. 손글씨, 밑줄, 별표, 여백 메모, 학생 풀이 흔적은 모두 제외해줘. tags 필드와 최상위 difficulty 필드는 만들지 말고, 첫 글자가 {이고 마지막 글자가 }인 순수 JSON만 출력해줘.",
  },
  {
    id: "builtin-concept-links",
    name: "개념 링크 강화",
    builtIn: true,
    content: "인쇄된 문제와 답안지 해설에 등장하는 핵심 개념을 concepts 배열에 정리하고, question이나 memo 안에서 자연스럽게 연결할 수 있는 개념명은 [[개념명]] 형태로 표시해줘. 손글씨/밑줄/별표/여백 메모는 제외하고, 도표/그래프는 Markdown 표나 [도표/그래프 설명]으로 보존해줘. tags 필드 없이 순수 JSON 객체 1개만 출력해줘.",
  },
  {
    id: "builtin-concept-knowledge-json",
    name: "개념자료 앱 호환 JSON",
    builtIn: true,
    content: `개념 정리 자료를 오답노트 앱에 바로 가져올 수 있는 순수 JSON 객체 1개로 만들어줘.

우선 아래 둘 중 하나로 출력해줘.

1. 개념노트 여러 개:
{
  "entries": [
    {
      "entryKind": "concept",
      "title": "개념명",
      "subject": "사회",
      "question": "한 문단 정의",
      "memo": "단원, 시험 포인트, 오답 함정",
      "tags": ["사회", "단원명", "개념명"],
      "concepts": ["개념명"],
      "learningBlocks": [
        { "type": "concept", "title": "개념명", "content": "정의" },
        { "type": "checklist", "title": "시험 포인트", "content": "- 포인트" },
        { "type": "warning", "title": "오답 함정", "content": "- 함정" }
      ]
    }
  ]
}

2. 하나의 특강자료:
{
  "entryKind": "lecture",
  "title": "자료명",
  "subject": "사회",
  "sourceType": "json",
  "learningBlocks": [
    { "type": "concept", "title": "핵심 개념", "content": "설명" },
    { "type": "routine", "title": "판단 기준", "content": "- 키워드\\n- 시험 판단" }
  ]
}

nested units 구조가 꼭 필요하면 다음 필드를 반드시 넣어줘.
{
  "schemaVersion": "concept-knowledge-v1",
  "sourceType": "concept_knowledge_base",
  "units": [],
  "thinkerMatrix": [],
  "examSolvingRules": [],
  "minimalKeywordMap": {}
}

규칙:
- raw HTML, raw SVG, script, iframe, base64는 절대 넣지 마.
- learningBlocks type은 concept, formula, routine, warning, review, checklist, diagram 중 하나만 써줘.
- 사상가 비교표는 thinkerMatrix 대신 가능하면 learningBlocks의 routine 카드로 정리해줘.
- 설명문, Markdown, 코드블록 없이 첫 글자가 {이고 마지막 글자가 }인 JSON만 출력해줘.`,
  },
];

export const builtInMemoTemplates: MemoTemplate[] = [
  {
    id: "builtin-review-memo",
    name: "복습 메모",
    builtIn: true,
    content: "핵심 개념\n- \n\n실수 원인\n- \n\n다시 볼 포인트\n- \n\n다음 복습\n- ",
  },
  {
    id: "builtin-answer-analysis",
    name: "답안 분석",
    builtIn: true,
    content: "정답 근거\n- \n\n헷갈린 보기\n- \n\n암기/공식\n- ",
  },
];
