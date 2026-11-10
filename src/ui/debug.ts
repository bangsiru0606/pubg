// 개발 서버(npm run dev) 전용 디버그 메뉴 (F9). 제출 빌드에는 들어가지 않는다 (main.ts 의 import.meta.env.DEV 분기, test:release 가 검사).
import type { ExploreScene } from '../scenes/ExploreScene';
import { el, esc, root } from './hud';

const MARK = '__CW_DEBUG__';
void MARK;

export function initDebug(scene: ExploreScene) {
  let box: HTMLElement | null = null;
  const close = () => { box?.remove(); box = null; };
  const open = () => {
    box = el('div', 'dbg'); box.id = 'debugmenu';
    const jumps = [1, 2, 3, 4, 5, 6, 7].map((n) => `<button data-j="${n}">씬 ${n} 시작</button>`).join('');
    box.innerHTML = `<div class="dbgt">디버그 메뉴 (F9) — 개발 서버 전용</div><div>${jumps}</div>
      <div><button data-a="reset">저장 초기화</button><button data-a="state">상태 보기</button><button data-a="close">닫기</button></div><pre id="dbgstate"></pre>`;
    box.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button'); if (!b) return;
      if (b.dataset.j) { close(); scene.jumpToScene(+b.dataset.j); }
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
