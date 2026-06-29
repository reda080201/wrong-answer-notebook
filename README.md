# 오답노트

React + Tauri로 만든 데스크톱 오답노트 앱입니다. 문제·오답·정답·해설을 기록하고, 이미지를 여러 장 첨부할 수 있습니다.

## 기능

- 과목별 오답 관리 (국어, 영어, 수학, 과학, 사회, 역사, 기타)
- 문제 / 내 답 / 정답 / 해설 / 태그
- **이미지 다중 첨부** (문제 사진, 풀이 캡처 등)
- 복습 완료 표시 및 필터
- 검색 (문제, 답, 태그)
- 로컬 저장 (Tauri: 앱 데이터 폴더 / 브라우저: localStorage)

## 사전 요구 사항

1. **Node.js** 18+
2. **Rust** (Tauri 빌드용) — [https://www.rust-lang.org/tools/install](https://www.rust-lang.org/tools/install)
3. Windows: **Visual Studio Build Tools** (C++ 워크로드)

Rust 설치 후 터미널을 다시 열어 주세요.

## 설치 및 실행

```bash
cd "커서 오답노트"
npm install
npm run tauri dev
```

브라우저에서만 UI를 보려면 (저장은 localStorage):

```bash
npm run dev
```

## 빌드 (설치 파일)

```bash
npm run tauri build
```

빌드 결과는 `src-tauri/target/release/bundle/` 에 생성됩니다.

## 로컬 검증

프론트엔드 변경 후에는 아래 명령을 확인합니다.

```bash
npm run check
```

Tauri/Rust 변경이 있으면 Rust 설치와 PATH 등록 후 아래 명령도 확인합니다.

```bash
cd src-tauri
cargo check
cd ..
npm run tauri dev
```

`cargo` 명령을 찾지 못하면 Rust 설치 후 터미널을 다시 열어 주세요.

## 데이터 위치

- **Tauri 앱**: `%APPDATA%\com.wronganswer.notebook\`
  - `entries.json` — 오답 목록
  - `images/` — 첨부 이미지

## 기술 스택

- React 19 + TypeScript + Vite
- Tauri 2
- 로컬 JSON + 파일 시스템 저장
