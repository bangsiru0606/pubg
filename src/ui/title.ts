// 최소 타이틀 화면: 새 게임 / 이어하기(저장이 있을 때만) / 조작법. 아트는 7단계.
import { el, esc, root } from './hud';
import { popModal, pushModal } from './input';

export const CONTROLS: [string, string][] = [
  ['← → / A D', '이동'], ['Shift', '달리기'], ['Enter', '조사 · 대화 · 선택'], ['Tab', '사건 수첩 열기/닫기'],
  ['↑ ↓', '선택지 이동'], ['1~9', '선택지 번호'], ['Esc', '닫기 · 취소'], ['마우스', '근접 조사 · 퍼즐 드래그 · 클릭'],
];

export function openTitle(opts: { canContinue: boolean; onNew: () => void; onContinue: () => void }) {
  const box = el('div', 'modal title'); box.id = 'title';
  root().append(box);
  const items = [
    { label: '새 게임', run: () => { close(); opts.onNew(); } },
    ...(opts.canContinue ? [{ label: '이어하기', run: () => { close(); opts.onContinue(); } }] : []),
    { label: '조작법', run: () => { showControls = !showControls; render(); } },
  ];
  let sel = 0, showControls = false;
  const close = () => { popModal('title'); box.remove(); };
  function render() {
    box.innerHTML = `<div class="tt">병원의 고해</div><div class="ts">Confession Ward</div>
      <div class="tm">${items.map((it, i) => `<button class="opt${i === sel ? ' sel' : ''}" data-i="${i}">${esc(it.label)}</button>`).join('')}</div>
      ${showControls ? `<div class="ctrl">${CONTROLS.map(([k, v]) => `<div><kbd>${esc(k)}</kbd> ${esc(v)}</div>`).join('')}</div>` : ''}
      <div class="foot">↑↓ 이동 · Enter 선택</div>`;
  }
  box.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null; if (b) { sel = +b.dataset.i!; items[sel].run(); } });
  pushModal({
    id: 'title',
    onKey(e) {
      if (e.key === 'ArrowDown') sel = (sel + 1) % items.length;
      else if (e.key === 'ArrowUp') sel = (sel + items.length - 1) % items.length;
      else if (e.key === 'Escape' && showControls) showControls = false;
      else if (e.key === 'Enter' && !e.repeat) { items[sel].run(); return; }
      render();
    },
  });
  render();
}
