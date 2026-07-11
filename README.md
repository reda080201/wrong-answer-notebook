# wrong-answer-notebook

React + Tauri로 만든 로컬 학습·오답노트 앱입니다. 단일 오답, 시험지, 개념노트, 특강자료를 한곳에 저장하고 문제별 복습 흐름으로 다시 볼 수 있습니다.

## 주요 기능

- 문제, 내 답, 정답, 단계별 해설, 메모, 이미지 저장
- 시험지 문항별 중요 표시, 난이도 점수, 복습 상태, 오답 원인 분석
- 문제지 / 해설지 / 특강 / 분석 보기와 문제별 집중·극장 모드
- GPT 결과 JSON, Gemini Vision 결과, JSON+PNG 올인원 가져오기
- import audit, 예상 문제 번호, 손글씨 제외, 도표 연결 검증
- `described_only` 도표와 React SVG 학습 다이어그램
- KaTeX 수식, 이미지 확대·주석, 시험지 문항 선택 및 GPT 보내기
- 문항별 복습과 장기 점검, 오답 원인별 복습 전략
- 개념노트·특강자료 라이브러리와 개념 링크
- 다크모드, 자동 백업, 백업 복원, 무결성 검사, 미사용 이미지 정리

## 요구 사항

- Node.js 18 이상
- 브라우저 모드만 사용할 때는 Node.js만 필요합니다.
- Tauri 데스크톱 앱에는 Rust와 Windows Visual Studio Build Tools(C++ 워크로드)가 필요합니다.

Rust는 [공식 설치 안내](https://www.rust-lang.org/tools/install)에서 설치할 수 있습니다. 설치 후 터미널을 다시 열어 주세요.

## 설치 및 실행

```bash
git clone https://github.com/reda080201/wrong-answer-notebook.git
cd wrong-answer-notebook
npm ci
```

브라우저 모드로 실행하려면:

```bash
npm run dev
```

브라우저 모드는 localStorage를 사용하고 Tauri 전용 파일 저장, Gemini 키 보안 저장, 로컬 이미지 경로 기능은 사용할 수 없습니다.

데스크톱 앱으로 실행하려면:

```bash
npm run tauri dev
```

## AI 가져오기

기본 provider는 수동 입력입니다. ChatGPT나 Gemini 웹에서 만든 JSON을 붙여넣거나 올인원 파일로 가져올 수 있습니다.

- 단일 entry JSON
- `wrong-answer-notebook-import-v2` wrapper JSON
- 여러 entry batch preview
- `import.json` + PNG/JPG/WebP 또는 ZIP
- 선택적 Gemini Vision provider

AI 키는 코드에 포함하지 않습니다. Tauri에서는 OS keyring 또는 환경변수(`GOOGLE_API_KEY`, `GEMINI_API_KEY`)를 사용합니다.

## 검증 및 빌드

프론트엔드 변경 후:

```bash
npm run check
```

개별 실행:

```bash
npx tsc -b --pretty false
npm run lint
npm run test
npm run build
```

Tauri/Rust 변경 후:

```bash
cd src-tauri
cargo fmt --check
cargo check
cargo test
cd ..
npm run tauri -- build --no-bundle
```

설치 파일을 만들려면:

```bash
npm run tauri build
```

## 데이터 위치

Tauri 앱은 OS 앱 데이터 폴더에 다음 데이터를 저장합니다.

- `entries.json`: 학습 항목과 복습 기록
- `settings.json`: 공개 앱 설정
- `images/`: 첨부 이미지
- AI 비밀 키: 일반 설정 JSON이 아니라 OS keyring 우선 사용

브라우저 모드에서는 항목과 설정이 localStorage에 저장됩니다.

## CI

GitHub Actions는 Windows 환경에서 frontend lint/test/build와 Rust fmt/check/test를 실행합니다. Tauri 컴파일 smoke job을 required status check로 설정하면 merge 전에 데스크톱 컴파일 회귀도 함께 확인할 수 있습니다. 브라우저 E2E smoke test는 Playwright 도입 후 별도 job으로 추가할 수 있습니다.

서명 인증서가 필요한 설치 파일 배포와 release automation은 별도의 release workflow에서 관리합니다.

## 기술 스택

- React 19 + TypeScript + Vite
- Tauri 2 + Rust
- JSON 파일 저장 및 브라우저 localStorage
- KaTeX, JSZip, Gemini generateContent 연동
