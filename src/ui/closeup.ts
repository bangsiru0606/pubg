// 마우스 근접 조사 (craft_on MouseCloseupUI / ClueDetailView 대응).
// 소품은 평소 밝기 80%, 마우스를 올리거나 키보드로 선택하면 100% + 반투명 검은 이름표. 클릭 영역은 투명 여백을 뺀 실제 그림(마스크)에 맞춘다.
// 상세 화면: 확대 그림은 왼쪽(비율 유지), 제목·설명은 오른쪽 칸(길면 이 칸만 스크롤), 글은 그림 위에 올리지 않는다.
import type { GameState } from '../core';
import { dialogues } from '../explore/content';
import { hitsArt, maskOf } from '../explore/mask';
import { el, esc, root } from './hud';
import { popModal, pushModal } from './input';

interface Hotspot { name: string; icon: string; detail: string; desc: string; cx: number; cy: number; w: number } // cx,cy,w: 배경(1376×768) 좌표, 실제 그림 영역 기준
interface Closeup { title: string; bg: string; hotspots: Hotspot[] }
const BG_W = 1376, BG_H = 768;
// 사무실 책상: craft_on 의 책상 위 소품. 신문은 쓰지 않는다 (이전계획 3.1).
export const closeups: Record<string, Closeup> = {
  office_desk: {
    title: '출근한 아침, 책상을 살펴본다 (마우스로 조사)', bg: 'assets/illust/desk.webp',
    hotspots: [
      { name: '모자', icon: 'hat', detail: 'hat_detail', desc: 'closeup_hat', cx: 560, cy: 175, w: 184 },
      { name: '캘린더', icon: 'calendar', detail: 'calendar_detail', desc: 'closeup_calendar', cx: 1010, cy: 210, w: 136 },
    ],
  },
};
const descOf = (id: string) => dialogues[id]?.nodes.m?.text ?? '';

export function openCloseup(_s: GameState, id: string, onClose: () => void) {
  const c = closeups[id];
  const box = el('div', 'modal closeup'); box.id = 'closeup';
  const hot = c.hotspots.map((h, i) => {
    const m = maskOf(h.icon);
    const wPct = (h.w / BG_W) * 100, aspect = m.w / m.h;
    return `<div class="hot" data-h="${i}" style="left:${(h.cx / BG_W) * 100}%;top:${(h.cy / BG_H) * 100}%;width:${wPct}%;aspect-ratio:${aspect}">
      <img src="assets/illust/${h.icon}.webp" alt="" style="width:${(m.W / m.w) * 100}%;left:${-(m.x / m.w) * 100}%;top:${-(m.y / m.h) * 100}%"><span class="hl">${esc(h.name)}</span></div>`;
  }).join('');
  box.innerHTML = `<img class="bg" src="${c.bg}" alt=""><div class="title">${esc(c.title)}</div>${hot}<button class="exit">나가기 (Esc)</button>`;
  root().append(box);
  let sel = -1; // 처음에는 선택 없음 (마우스를 올리거나 ←→ 를 누르면 100%)
  let detail: HTMLElement | null = null;
  const mark = () => box.querySelectorAll('.hot').forEach((b, i) => b.classList.toggle('sel', i === sel));
  const closeDetail = () => { detail?.remove(); detail = null; };
  const showDetail = (i: number) => {
    const h = c.hotspots[i];
    detail = el('div', 'detail', `<div class="dart"><img src="assets/illust/${h.detail}.webp" alt=""></div>
      <div class="dtext"><h3>${esc(h.name)}</h3><div class="dbody">${esc(descOf(h.desc))}</div><div class="dfoot">Enter / Esc / 클릭: 닫기</div></div>`);
    detail.id = 'closeup-detail';
    detail.addEventListener('click', closeDetail);
    box.append(detail);
  };
  const close = () => { popModal('closeup'); box.remove(); onClose(); };

  const frac = (hotEl: HTMLElement, ev: MouseEvent) => { const r = hotEl.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height]; };
  box.querySelectorAll<HTMLElement>('.hot').forEach((hotEl) => {
    const i = +hotEl.dataset.h!;
    const update = (ev: MouseEvent) => { const [fx, fy] = frac(hotEl, ev); hotEl.classList.toggle('on', hitsArt(c.hotspots[i].icon, fx, fy)); };
    hotEl.addEventListener('pointermove', update);
    hotEl.addEventListener('pointerleave', () => hotEl.classList.remove('on'));
    hotEl.addEventListener('click', (ev) => { const [fx, fy] = frac(hotEl, ev); if (hitsArt(c.hotspots[i].icon, fx, fy)) { sel = i; mark(); showDetail(i); } });
  });
  box.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('.exit')) close(); });
  pushModal({
    id: 'closeup',
    onKey(e) {
      if (detail) { if ((e.key === 'Enter' || e.key === 'Escape') && !e.repeat) closeDetail(); return; }
      if (e.key === 'Escape' && !e.repeat) close();
      else if (e.key === 'ArrowRight') { sel = (sel + 1) % c.hotspots.length; mark(); }
      else if (e.key === 'ArrowLeft') { sel = sel < 0 ? c.hotspots.length - 1 : (sel + c.hotspots.length - 1) % c.hotspots.length; mark(); }
      else if (e.key === 'Enter' && !e.repeat && sel >= 0) showDetail(sel);
    },
  });
  mark();
}
