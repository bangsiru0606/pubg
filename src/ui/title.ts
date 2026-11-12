// 최소 타이틀 화면: 새 게임 / 이어하기(저장이 있을 때만) / 조작법. 아트는 7단계.
import { getVolumes, isUnlocked, onUnlock, setVolume, sfx, toggleMute } from '../audio/audio';
import credits from '../data/credits.json';
import bgmCredits from '../data/bgm-credits.json';
import { el, esc, root } from './hud';
import { popModal, pushModal } from './input';

export const CONTROLS: [string, string][] = [
  ['← → / A D', '이동'], ['Shift', '달리기'], ['Enter', '조사 · 대화 · 선택'], ['Tab', '사건 수첩 열기/닫기'],
  ['↑ ↓', '선택지 이동'], ['1~9', '선택지 번호'], ['Esc', '닫기 · 취소'], ['M', '소리 켬/끔'], ['마우스', '근접 조사 · 퍼즐 드래그 · 클릭'],
];

let closeCurrent: (() => void) | null = null;
/** 열려 있는 타이틀을 닫는다 (시험용 훅에서 사용) */
export const closeTitleNow = () => closeCurrent?.();

/** 같은 출처 문구를 쓰는 곡들을 한 줄로 묶는다 ("bgm_a: X", "bgm_b: X" → "a·b (2곡): X"). 화면에 다 들어가게 하려는 것이다. */
export function groupCredits(lines: string[]): string[] {
  const groups = new Map<string, string[]>(), plain: string[] = [];
  for (const l of lines) { const m = /^(\w+):\s*(.+)$/.exec(l); if (m) groups.set(m[2], [...(groups.get(m[2]) ?? []), m[1].replace(/^bgm_/, '')]); else plain.push(l); }
  return [...[...groups].map(([rest, names]) => `${names.join(', ')} (${names.length}곡): ${rest}`), ...plain];
}
const VOLS = [['master', '마스터 음량'], ['bgm', '배경음 음량'], ['sfx', '효과음 음량']] as const;
const bar = (v: number) => `${'■'.repeat(Math.round(v * 10))}${'□'.repeat(10 - Math.round(v * 10))} ${Math.round(v * 100)}%`;

const ART = '<img class="tbg" src="assets/illust/title_key.webp" alt=""><div class="tveil"></div>';

export function openTitle(opts: { canContinue: boolean; onNew: () => void; onContinue: () => void }) {
  const box = el('div', 'modal title'); box.id = 'title';
  root().append(box);
  let page: 'main' | 'settings' | 'info' = 'main', sel = 0, setSel = 0, showControls = false;
  const items = [
    { label: '새 게임', run: () => { sfx('onUiConfirm'); close(); opts.onNew(); } },
    ...(opts.canContinue ? [{ label: '이어하기', run: () => { sfx('onUiConfirm'); close(); opts.onContinue(); } }] : []),
    { label: '조작법', run: () => { showControls = !showControls; render(); } },
    { label: '설정', run: () => { page = 'settings'; setSel = 0; render(); } },
    { label: '정보', run: () => { page = 'info'; render(); } },
  ];
  const close = () => { popModal('title'); box.remove(); closeCurrent = null; };
  closeCurrent = close;
  const bgmLines = (bgmCredits as string[]).length ? groupCredits(bgmCredits as string[]) : [credits.bgmPending];
  function render() {
    box.classList.toggle('dim', page !== 'main'); // 설정·정보 화면은 그림을 어둡게 눌러 글자가 읽히게 한다
    const hint = isUnlocked() ? '' : '<div class="anykey">아무 키나 눌러 시작</div>';
    if (page === 'settings') {
      const v = getVolumes();
      box.innerHTML = `${ART}<div class="tt" style="font-size:18px">설정</div>
        <div class="tm wide">${VOLS.map(([k, name], i) => `<button class="opt${i === setSel ? ' sel' : ''}" data-v="${i}">${name}  ${bar(v[k])}</button>`).join('')}
        <button class="opt${setSel === 3 ? ' sel' : ''}" data-v="3">전체 음소거 (M)  ${v.muted ? '켬' : '끔'}</button>
        <button class="opt${setSel === 4 ? ' sel' : ''}" data-v="4">돌아가기</button></div>
        <div class="foot">↑↓ 이동 · ←→ 음량 · Enter 선택 · Esc 돌아가기</div>`;
    } else if (page === 'info') {
      box.innerHTML = `${ART}<div class="tt" style="font-size:18px">정보</div><div class="ctrl info" style="text-align:left">
        <div>${esc(credits.title)}</div>${credits.lines.map((l) => `<div>${esc(l)}</div>`).join('')}
        <div style="margin-top:4px;color:#6b4a1a;font-weight:bold">배경음악 출처</div>${bgmLines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>
        <div class="foot">Enter / Esc 돌아가기</div>`;
    } else {
      box.innerHTML = `${ART}<div class="tt">병원의 고해</div><div class="ts">Confession Ward</div>
        <div class="tm">${items.map((it, i) => `<button class="opt${i === sel ? ' sel' : ''}" data-i="${i}">${esc(it.label)}</button>`).join('')}</div>
        ${showControls ? `<div class="ctrl">${CONTROLS.map(([k, v]) => `<div><kbd>${esc(k)}</kbd> ${esc(v)}</div>`).join('')}</div>` : ''}
        ${hint}<div class="foot">↑↓ 이동 · Enter 선택</div>`;
    }
  }
  const adjust = (i: number, d: number) => { if (i < 3) { const k = VOLS[i][0]; setVolume(k, getVolumes()[k] + d * 0.1); sfx('onUiMove'); } };
  const pickSetting = (i: number) => { if (i === 3) { toggleMute(); } else if (i === 4) { page = 'main'; } render(); };
  box.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const v = t.closest('[data-v]') as HTMLElement | null, b = t.closest('[data-i]') as HTMLElement | null;
    if (page === 'info') { page = 'main'; render(); return; }
    if (page === 'settings') { if (v) { setSel = +v.dataset.v!; if (setSel >= 3) pickSetting(setSel); else render(); } return; }
    if (b) { sel = +b.dataset.i!; items[sel].run(); }
  });
  // 첫 입력(소리 잠금 해제)이 일어나면 "아무 키나" 안내를 지운다
  onUnlock(() => { if (box.isConnected) render(); });
  pushModal({
    id: 'title',
    onKey(e) {
      if (page === 'info') { if ((e.key === 'Enter' || e.key === 'Escape') && !e.repeat) { page = 'main'; render(); } return; }
      if (page === 'settings') {
        if (e.key === 'ArrowDown') setSel = (setSel + 1) % 5;
        else if (e.key === 'ArrowUp') setSel = (setSel + 4) % 5;
        else if (e.key === 'ArrowLeft') adjust(setSel, -1);
        else if (e.key === 'ArrowRight') adjust(setSel, 1);
        else if (e.key === 'Escape') page = 'main';
        else if (e.key === 'Enter' && !e.repeat) { pickSetting(setSel); return; }
        render(); return;
      }
      if (e.key === 'ArrowDown') sel = (sel + 1) % items.length;
      else if (e.key === 'ArrowUp') sel = (sel + items.length - 1) % items.length;
      else if (e.key === 'Escape' && showControls) showControls = false;
      else if (e.key === 'Enter' && !e.repeat) { items[sel].run(); return; }
      render();
    },
  });
  render();
}
