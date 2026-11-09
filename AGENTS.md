# 병원의 고해 (Confession Ward) — 에이전트 작업 규칙

Codex는 이 파일(`AGENTS.md`), Claude Code는 `CLAUDE.md`를 읽는다. 두 파일은 내용이 같아야 한다. 하나를 고치면 다른 하나도 똑같이 고친다.

## 먼저 읽을 문서

1. `docs/기획서_보정판.md` — 게임 내용의 유일한 기준. "Unity/C#" 표기는 아래 스택으로 대체해 읽는다.
2. `docs/이전계획.md` — 결정 사항, 에셋 규격, 단계별 작업 순서. 지금 몇 단계인지 확인하고 그 단계만 작업한다.
3. `docs/제출가이드.md` — 최종 제출 형식.

## 스택

- Vite + TypeScript(strict) + Phaser 3 (탐색 화면)
- HTML/CSS 오버레이 (대화, 사건 수첩, 근접 조사, 퍼즐, 최종 보고서, 엔딩)
- Vitest (테스트), Playwright (file:// 실행 검증)
- 선택: Tauri 2 (Windows exe)

## 명령

```bash
npm install
npm run dev            # 개발 서버
npm test               # Vitest
npm run validate       # 데이터 ID 참조 무결성 검사
npm run assets         # art/source → public/assets 정규화
npm run build:release  # release/ConfessionWard_v1.0_web.zip 생성 (index.html 더블클릭 실행)
npm run test:release   # zip을 풀어 file://로 열고 자동 플레이 확인 (Playwright)
```
(단계 1에서 실제 스크립트를 만들면 이 목록을 맞게 고친다.)

## 절대 규칙

### 게임 설계
- 보정판에 없는 단서·퍼즐·인물·엔딩을 추가하지 않는다. 사용자가 요청할 때만 추가한다.
- 맥락 단서(`context`)와 "수상한 반응"은 핵심 근거 슬롯에 넣을 수 없다.
- 결론 저장 시 정답 여부를 알려주지 않는다. 판정은 최종 보고서 제출 후에만.
- 오답 카드를 튕겨내거나 정답을 자동으로 끌어당기지 않는다.
- 찻잔·독살·화학자 설정은 폐기됐다. 되살리지 않는다.

### 코드 구조
- `src/core/`는 Phaser와 DOM을 import하지 않는다. 순수 TypeScript로 테스트 가능해야 한다.
- 정답 비교는 `DeductionResolver`, 퍼즐 판정 모듈, `EndingResolver`에서만 한다.
- 대사·단서·퍼즐·가설·엔딩·맵은 `src/data/*.json`에 둔다. 코드에 대사를 하드코딩하지 않는다.
- 데이터를 추가하거나 바꾸면 `npm run validate`와 `npm test`를 통과시킨다.

### 아트
- 기준 그림체는 craft_on(`D:\2026_game\2026_craft_on`)의 에셋이다. 원본 사본은 `art/source/`에 있고 **수정하지 않는다**.
- 탐색 화면은 논리 해상도 480×270, 정수 배율 확대, `pixelArt: true`. 규격은 `docs/이전계획.md` 2장과 `art/asset-spec.json`.
- 모든 탐색 에셋은 `npm run assets` 정규화를 거친 결과만 게임에서 쓴다. PPU나 스케일을 에셋마다 따로 맞추지 않는다.
- 이미지에 읽을 글자를 굽지 않는다. 문서 내용은 HTML로 표시한다.

### 제출 호환
- 최종 빌드는 zip을 풀고 `index.html`을 더블클릭(`file://`)해서 열려야 한다. 세부 규칙은 `docs/이전계획.md` 6.2.
  - JS·CSS는 `index.html`에 인라인. 런타임 `fetch()`/XHR 금지. 데이터는 TS import.
  - 이미지는 `./assets/` 상대경로, Phaser `loader.imageLoadType: 'HTMLImageElement'`.
  - 폰트는 base64 인라인 또는 시스템 폰트.
- README는 `docs/이전계획.md` 6.4 템플릿 순서를 유지한다.
- `localStorage` 접근은 try/catch로 감싼다.

### 원본 보호
- `D:\2026_game\2026_craft_on`, `D:\pubg`(Codex 버전), `D:\2026_PUBG\에셋`은 읽기 전용이다. 수정·이동·삭제하지 않는다.

## 커밋
- 단계 하나를 끝낼 때, 또는 의미 있는 기능 단위로 커밋한다.
- 커밋 전에 `npm test`와 `npm run validate`를 통과시킨다.
