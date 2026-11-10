// 개발 서버(npm run dev) 전용 디버그 메뉴 (F9). 제출 빌드에는 들어가지 않는다 (main.ts 의 import.meta.env.DEV 분기, test:release 가 검사).
import type { ExploreScene } from '../scenes/ExploreScene';
import { createGameState, setPlayerName } from '../core';
import { buildProgress } from '../explore/playthrough';
import { START } from '../explore/interaction';
import { setPrompt } from './hud';
import { el, esc, root } from './hud';
const CSS = `/* ---------- 디버그 메뉴 (개발 서버 전용) ---------- */
.dbg { position: absolute; left: 6px; top: 6px; width: 250px; background: rgba(10,10,14,.96); border: 1px solid #e05050; padding: 4px; z-index: 99; font-size: 8px; }
.dbg button { margin: 1px; background: #2a2d33; border: 1px solid #555; padding: 0 4px; cursor: pointer; }
.dbg .dbgt { color: #e05050; } .dbg pre { white-space: pre-wrap; margin: 2px 0 0; max-height: 150px; overflow: auto; font-size: 7px; }

/* 종이 위의 진술 3단계 (대비 확보) */
.ndetail .st-unconfirmed { color: #5f594b; border-bottom-color: #7a7365; }
.ndetail .st-contradiction { color: #9a2a1e; }
.ndetail .st-revised s { color: #6e6757; } .ndetail .st-revised b { color: #24501f; border-bottom-color: #3f7a38; }
.ndetail .st-revised::before { color: #2f6b2c; }
.ndetail .tag { color: #f1e8d0; }
`; // 제출 빌드의 CSS 에 섞이지 않도록 이 모듈이 직접 넣는다
const addCss = () => { const st = document.createElement('style'); st.textContent = CSS; document.head.append(st); };

/** 씬 N 시작 지점으로 이동 (정상 플레이와 같은 상태). 개발 서버·시험 빌드에서만 장면에 붙는다 — 제출 빌드에는 이 모듈이 없다. */
export function installJump(scene: ExploreScene & { jumpToScene?: (n: number) => void }) {
  scene.jumpToScene = (n: number) => {
    setPrompt(null); scene.locked = false;
    if (n === 1) { scene.state = createGameState(); setPlayerName(scene.state.playerName); scene.started = false; scene.buildArea(START.area, START.x); void scene.runOpening(); return; }
    const { state, area, x } = buildProgress(n, { name: scene.state?.playerName });
    scene.state = state; setPlayerName(state.playerName); scene.started = true;
    scene.buildArea(area, x);
    if (n === 7) scene.startReport();
  };
}

const MARK = '__CW_DEBUG__';
void MARK;

export function initDebug(scene: ExploreScene) {
  installJump(scene); addCss();
  let box: HTMLElement | null = null;
  const close = () => { box?.remove(); box = null; };
  const open = () => {
    box = el('div', 'dbg'); box.id = 'debugmenu';
    const jumps = [1, 2, 3, 4, 5, 6, 7].map((n) => `<button data-j="${n}">씬 ${n} 시작</button>`).join('');
    box.innerHTML = `<div class="dbgt">디버그 메뉴 (F9) — 개발 서버 전용</div><div>${jumps}</div>
      <div><button data-a="reset">저장 초기화</button><button data-a="state">상태 보기</button><button data-a="close">닫기</button></div><pre id="dbgstate"></pre>`;
    box.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button'); if (!b) return;
      if (b.dataset.j) { close(); (scene as unknown as { jumpToScene: (n: number) => void }).jumpToScene(+b.dataset.j); }
      else if (b.dataset.a === 'reset') { try { Object.keys(localStorage).filter((k) => k.startsWith('confession_ward_save')).forEach((k) => localStorage.removeItem(k)); } catch { /* 저장소 사용 불가 */ } box!.querySelector('pre')!.textContent = '저장을 모두 지웠다.'; }
      else if (b.dataset.a === 'state') {
        const s = scene.state;
        box!.querySelector('pre')!.innerHTML = esc(`구역 ${s.currentSceneId} · 이름 ${s.playerName}\n플래그: ${s.flags.join(', ')}\n단서(${s.evidenceIds.length}): ${s.evidenceIds.map((id) => id.slice(0, 3) + (s.verifiedEvidenceIds.includes(id) ? '✓' : '?')).join(' ')}\n해결한 퍼즐: ${s.solvedPuzzleIds.join(', ')}\n저장 결론: ${JSON.stringify(s.selectedHypothesisByClaim)}\n증거 보존 ${s.evidenceSecured} · 보고 대상 ${s.reportTarget}`);
      } else close();
    });
    root().append(box);
  };
  window.addEventListener('keydown', (e) => { if (e.key === 'F9') { e.preventDefault(); if (box) close(); else open(); } });
}
