// 엔딩: (A 만) 마지막 대본 → 엔딩 카드 + 결과 세 줄 → 추리 등급 → 선택.
// D: 보고서 다시 쓰기(씬 7 시작 시점으로) · 처음부터 · 타이틀로.  그 밖: 처음부터 · 타이틀로.
import { characterName, gradeOf, pendingPuzzles, resolveEnding, resolveEndingLines, shownEvidence, unverifiedClues, type GameState } from '../core';
import { bgmPop, bgmPush, endingTrack, sfx } from '../audio/audio';
import { el, esc, root } from './hud';
import { popModal, pushModal } from './input';

const KEYS = [['haneul', '정하늘'], ['organization', '조직'], ['eunho', '박은호']] as const;

export function openEnding(s: GameState, h: { onRetry: () => void; onRestart: () => void; onTitle: () => void }) {
  const ending = resolveEnding(s);
  const lines = resolveEndingLines(s);
  const grade = gradeOf(s);
  const talk = ending.finalDialogue ?? [];
  const uv = unverifiedClues(s, pendingPuzzles(s).map((p) => p.id));
  const names = (ids: string[]) => ids.map((id) => shownEvidence(s, id)?.title ?? id).join(', ');
  const unverified = uv.failed.length || uv.open.length ? `<p class="note unv" style="text-align:center">검증하지 못한 단서 — ${[uv.failed.length ? `검증 실패(신빙성 낮음): ${esc(names(uv.failed))}` : '', uv.open.length ? `미결: ${esc(names(uv.open))}` : ''].filter(Boolean).join(' · ')}</p>` : '';
  const pages: ('talk' | 'card' | 'grade')[] = [...talk.map(() => 'talk' as const), 'card', 'grade'];
  let pi = 0, sel = 0;
  const buttons = [
    ...(ending.id === 'ending_d' ? [{ label: '보고서 다시 쓰기', run: h.onRetry }] : []),
    { label: '처음부터', run: h.onRestart }, { label: '타이틀로', run: h.onTitle },
  ];
  const box = el('div', 'modal ending'); box.id = 'ending';
  root().append(box);
  bgmPush('ending', endingTrack(ending.id));
  const close = () => { bgmPop('ending'); sfx('onUiConfirm'); popModal('ending'); box.remove(); };

  function render() {
    const kind = pages[pi];
    if (kind === 'talk') {
      const [who, text] = talk[pi];
      box.innerHTML = `<div style="margin-top:80px;text-align:center"><div style="color:#e2c98a">${esc(characterName(who))}</div><div style="margin-top:6px;font-size:12px">“${esc(text)}”</div></div><div class="foot">Enter 계속</div>`;
    } else if (kind === 'card') {
      // 그림은 위쪽에 16:9 전체가 보이게 두고(옆은 같은 그림을 흐리게 깐다), 결과 세 줄은 그 아래 어두운 판에 모은다. 그림의 주요 부분은 가려지지 않는다.
      const res = KEYS.map(([k, name]) => `<p><b>${name}</b> — ${esc(lines[k].text)}</p>`);
      box.innerHTML = `<img class="ebg" src="assets/illust/${ending.id}.webp" alt=""><img class="ebf" src="assets/illust/${ending.id}.webp" alt=""><div class="etop"><div class="etitle">${esc(ending.title)}</div><div class="ecard">“${esc(ending.card)}”</div></div>
        <div class="eres">${res.join('')}</div><div class="foot">Enter 계속</div>`;
    } else {
      const rows = grade.claims.map((c, i) => `<tr><td>질문 ${'ABCD'[i]}</td><td>${c.solved ? '해결' : '미해결'}</td><td>반박 근거 ${c.rebuttalHit ? '적중' : '빗나감'}</td><td>${c.score}/3점</td></tr>`).join('');
      box.innerHTML = `<div class="etitle" style="font-size:13px">추리 등급 ${grade.letter} (${grade.total}/${grade.max})</div>
        <table class="grade" style="margin:6px auto">${rows}</table>
        <p style="text-align:center">퍼즐 오답 ${grade.wrongTotal}회 · 힌트가 열린 퍼즐 ${grade.hintedPuzzles}개 (최고 ${grade.maxHintLevel}단계) — 힌트는 엔딩에 영향을 주지 않는다.</p>
        ${unverified}${ending.id === 'ending_d' ? '<p class="note" style="text-align:center">재도전하면 해결하지 못한 질문과 관련된 단서가 수첩에서 먼저 보인다.</p>' : ''}
        <div style="width:150px;margin:6px auto">${buttons.map((b, i) => `<button class="opt${i === sel ? ' sel' : ''}" data-b="${i}" style="text-align:center">${esc(b.label)}</button>`).join('')}</div>
        <div class="foot">↑↓ 이동 · Enter 선택</div>`;
    }
  }
  box.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-b]') as HTMLElement | null;
    if (b) { close(); buttons[+b.dataset.b!].run(); } else if (pages[pi] !== 'grade') { pi++; render(); }
  });
  pushModal({
    id: 'ending',
    onKey(e) {
      if (pages[pi] !== 'grade') { if (e.key === 'Enter' && !e.repeat) { pi++; render(); } return; }
      if (e.key === 'ArrowDown') sel = (sel + 1) % buttons.length;
      else if (e.key === 'ArrowUp') sel = (sel + buttons.length - 1) % buttons.length;
      else if (e.key === 'Enter' && !e.repeat) { close(); buttons[sel].run(); return; }
      render();
    },
  });
  render();
}
export const unsolvedClaimIds = (s: GameState) => gradeOf(s).claims.filter((c) => !c.solved).map((c) => c.claimId);
