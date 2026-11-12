// 대사 기록: 지금 구역에서 본 대사를 다시 읽는다 (대화 중에는 L 키·[L 기록] 버튼, 탐색 중에는 L 키). 저장 데이터에는 넣지 않는다(이어하기 뒤에는 새로 쌓인다).
import { characterLabel, characterName } from '../core';
import { areaName } from './labels';
import { el, esc, root } from './hud';
import { popModal, pushModal, topModalId } from './input';

interface Line { speaker: string; text: string; voice?: string }
const MAX = 200;
const logs = new Map<string, Line[]>();
let area = '';

export const setBacklogArea = (id: string) => { area = id; };
export function logLine(speaker: string, text: string, voice?: string) {
  const l = logs.get(area) ?? []; logs.set(area, l);
  const last = l[l.length - 1];
  if (last && last.speaker === speaker && last.text === text) return; // 같은 줄을 연달아 기록하지 않는다 (선택지로 되돌아온 경우)
  l.push({ speaker, text, voice }); if (l.length > MAX) l.shift();
}
export const backlogOf = (id: string) => logs.get(id) ?? [];

export function openBacklog() {
  if (topModalId() === 'backlog') return;
  const lines = backlogOf(area);
  const box = el('div', 'modal backlog'); box.id = 'backlog';
  const row = (l: Line) => {
    const who = l.voice === 'message' ? `${characterName(l.speaker)}의 메시지` : l.voice ? '' : characterLabel(l.speaker);
    const t = l.voice === 'inner' || l.voice === 'action' ? `(${esc(l.text)})` : esc(l.text);
    return `<div class="bl${l.voice ? ` v-${l.voice}` : ''}">${who ? `<b>${esc(who)}</b> ` : ''}${t}</div>`;
  };
  box.innerHTML = `<div class="btitle">대사 기록 — ${esc(areaName(area))}</div><div class="blist">${lines.length ? lines.map(row).join('') : '<div class="bl v-action">아직 이 구역에서 본 대사가 없다.</div>'}</div><div class="foot">↑↓ 스크롤 · L / Enter / Esc 닫기</div>`;
  root().append(box);
  const list = box.querySelector('.blist') as HTMLElement;
  list.scrollTop = list.scrollHeight; // 가장 최근 대사가 아래에 보이게
  const close = () => { popModal('backlog'); box.remove(); };
  box.addEventListener('click', close);
  pushModal({
    id: 'backlog',
    onKey(e) {
      if (e.key === 'ArrowUp') list.scrollTop -= 24; else if (e.key === 'ArrowDown') list.scrollTop += 24;
      else if (e.key === 'PageUp') list.scrollTop -= 90; else if (e.key === 'PageDown') list.scrollTop += 90;
      else if (!e.repeat && (e.key === 'Escape' || e.key === 'Enter' || e.key === 'l' || e.key === 'L')) close();
    },
  });
}
