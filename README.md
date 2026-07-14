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

## 로컬 MCP 브리지

데스크톱 앱은 선택적으로 읽기 전용 MCP 브리지를 제공합니다. 기본값은 꺼짐이며, `설정 > 고급 > 로컬 MCP 브리지`에서만 켤 수 있습니다.

- `127.0.0.1`에만 바인딩되며 외부 네트워크에는 열리지 않습니다.
- 인증 토큰은 OS keyring에만 저장되고 설정 파일, 화면, 로그에는 표시하지 않습니다.
- 지원 도구는 노트 검색과 읽기만 제공하며 항목·이미지·설정 변경 도구는 없습니다.
- 기본 응답은 정답·해설·복습 기록을 제외합니다. MCP 클라이언트가 명시적으로 요청해야 제한적으로 포함됩니다.
- 브라우저 모드에서는 사용할 수 없습니다.

### 로컬 pairing 범위

이 브리지는 표준 OAuth 서버나 공개 원격 MCP endpoint가 아닙니다. 앱에서 만든 **5분짜리 일회성 pairing 코드**를 앱 전용 로컬 클라이언트가 `/pair` endpoint에 교환해, 현재 실행 중인 로컬 브리지에만 접속하는 bootstrap 방식입니다.

- 영구 Bearer credential은 화면, `settings.json`, 감사 로그에 표시하거나 기록하지 않습니다.
- pairing 코드는 한 번 교환하면 바로 무효화됩니다. 코드가 만료되거나 연결을 끊으면 새 코드를 만드세요.
- `연결 자격 증명 회전` 또는 `모든 연결 해제`는 기존 credential과 모든 미사용 pairing 코드를 무효화합니다.
- `/pair` 응답으로 얻은 임시 접속 credential은 로컬 클라이언트의 메모리에서만 사용하고, 문서·터미널 기록·스크린샷·환경 변수 파일에 저장하지 마세요.

따라서 현재 지원 범위는 다음과 같습니다.

- 지원: 이 pairing 규칙을 구현한 로컬 MCP 클라이언트 또는 로컬 개발용 helper를 통한 `127.0.0.1` 연결
- 미지원: ChatGPT가 앱에 직접 연결하는 흐름, Secure MCP Tunnel 자동 설정, 공개 인터넷 endpoint, 표준 OAuth 기반 third-party 클라이언트 onboarding

ChatGPT 또는 Secure MCP Tunnel 연결은 별도 tunnel client와 표준 인증/배포 설계를 갖춘 후 지원해야 합니다. 원격 노출이나 자동 전송은 별도 사용자 동의와 보안 검토 없이 활성화하지 않습니다.

### MCP Inspector 수동 smoke 점검

Inspector는 앱 전용 `/pair` 교환을 자동으로 수행하지 않습니다. 아래 절차는 **개발자가 로컬에서만** protocol 응답을 확인할 때 사용합니다.

1. 앱 설정에서 로컬 MCP 브리지를 켜고 `연결 테스트`가 성공하는지 확인합니다.
2. `연결 코드 만들기`로 일회성 코드를 발급합니다. pairing-aware 로컬 helper가 그 코드를 `POST /pair`에 교환하도록 합니다. 이 helper는 반환 credential을 화면이나 파일에 출력하지 않고 Inspector 실행 프로세스에만 전달해야 합니다.
3. Inspector의 Streamable HTTP 서버 주소를 `http://127.0.0.1:<앱에 표시된 포트>/mcp`로 설정하고, helper가 전달한 임시 `Authorization: Bearer ...` 헤더만 현재 실행 세션에 적용합니다.
4. `initialize`를 호출해 negotiated `protocolVersion`과 `tools`, `resources` capability를 확인합니다.
5. `notifications/initialized`를 보내고 응답이 `202 Accepted`이며 body가 비어 있는지 확인합니다.
6. `tools/list`에서 다섯 읽기 전용 도구와 각 `inputSchema`, `annotations.readOnlyHint: true`를 확인합니다.
7. `tools/call`의 `health_check`를 호출하고, 이어서 `search_notebook` 또는 `get_question`을 최소 한 번 호출합니다. 이미지가 포함된 문항은 `resources/read`로 `notebook-image://...` resource를 읽어 MIME과 blob 응답을 확인합니다.
8. Inspector를 닫은 뒤 앱에서 `모든 연결 해제` 또는 credential 회전을 실행해 임시 접속 credential을 폐기합니다.

`GET /mcp`는 SSE를 제공하지 않는 현재 구현에서 `405 Method Not Allowed`를 반환하는 것이 정상입니다. 브리지 상태가 `running`인 것만으로는 실제 MCP 연결 성공을 뜻하지 않으며, 위 요청들이 모두 성공해야 연결 점검이 완료됩니다.

## CI

GitHub Actions는 Windows 환경에서 frontend lint/test/build와 Rust fmt/check/test를 실행합니다. Tauri 컴파일 smoke job을 required status check로 설정하면 merge 전에 데스크톱 컴파일 회귀도 함께 확인할 수 있습니다. 브라우저 E2E smoke test는 Playwright 도입 후 별도 job으로 추가할 수 있습니다.

서명 인증서가 필요한 설치 파일 배포와 release automation은 별도의 release workflow에서 관리합니다.

## 기술 스택

- React 19 + TypeScript + Vite
- Tauri 2 + Rust
- JSON 파일 저장 및 브라우저 localStorage
- KaTeX, JSZip, Gemini generateContent 연동
