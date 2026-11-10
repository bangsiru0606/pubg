// 마우스 근접 조사 (MouseCloseupUI 대응): 호버 하이라이트 + 이름표, 클릭 확대. 키보드: ←→ 이동, Enter 확대, Esc 나가기.
import { el, esc, root } from './hud';
import { popModal, pushModal } from './input';

interface Hotspot { name: string; icon: string; detail: string; cx: number; cy: number; w: number } // 좌표: 배경 이미지(1376×768) px
interface Closeup { title: string; bg: string; hotspots: Hotspot[] }
const BG_W = 1376, BG_H = 768;

// 사무실 책상: craft_on 의 책상 위 소품. 신문은 쓰지 않는다 (이전계획 3.1).
export const closeups: Record<string, Closeup> = {
  office_desk: {
    title: '책상을 살펴본다', bg: 'assets/illust/desk.png',
    hotspots: [
      { name: '모자', icon: 'assets/illust/hat.png', detail: 'assets/illust/hat_detail.png', cx: 560, cy: 175, w: 190 },
      { name: '캘린더', icon: 'assets/illust/calendar.png', detail: 'assets/illust/calendar_detail.png', cx: 1010, cy: 210, w: 140 },
    ],
  },
};

export function openCloseup(id: string, onClose: () => void) {
  const c = closeups[id];
  const box = el('div', 'modal closeup'); box.id = 'closeup';
  const hot = c.hotspots.map((h, i) =>
    `<button class="hot" data-h="${i}" style="left:${(h.cx / BG_W) * 100}%;top:${(h.cy / BG_H) * 100}%;width:${(h.w / BG_W) * 100}%"><img src="${h.icon}" alt=""><span class="hl">[${esc(h.name)}]</span></button>`).join('');
  box.innerHTML = `<img class="bg" src="${c.bg}" alt=""><div class="title">${esc(c.title)} — 마우스를 올리거나 ←→ Enter</div>${hot}<button class="exit">나가기 (Esc)</button>`;
  root().append(box);
  let sel = 0;
  let detail: HTMLElement | null = null;
  const mark = () => box.querySelectorAll('.hot').forEach((b, i) => b.classList.toggle('sel', i === sel));
  const closeDetail = () => { detail?.remove(); detail = null; };
  const showDetail = (i: number) => {
    detail = el('div', 'detail', `<img src="${c.hotspots[i].detail}" alt="${esc(c.hotspots[i].name)}">`);
    detail.id = 'closeup-detail';
    detail.addEventListener('click', closeDetail);
    box.append(detail);
  };
  const close = () => { popModal('closeup'); box.remove(); onClose(); };
  box.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const h = t.closest('[data-h]') as HTMLElement | null;
    if (h) { sel = +h.dataset.h!; mark(); showDetail(sel); } else if (t.closest('.exit')) close();
  });
  pushModal({
    id: 'closeup',
    onKey(e) {
      if (detail) { if ((e.key === 'Enter' || e.key === 'Escape') && !e.repeat) closeDetail(); return; }
      if (e.key === 'Escape' && !e.repeat) close();
      else if (e.key === 'ArrowRight') { sel = (sel + 1) % c.hotspots.length; mark(); }
      else if (e.key === 'ArrowLeft') { sel = (sel + c.hotspots.length - 1) % c.hotspots.length; mark(); }
      else if (e.key === 'Enter' && !e.repeat) showDetail(sel);
    },
  });
  mark();
}
