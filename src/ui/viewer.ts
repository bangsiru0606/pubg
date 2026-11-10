// 단서 원문 보기 (ClueDetailView 대응). 수첩의 "원문 다시 열기"와 단서 획득 시 사용.
import { evidenceById, isVerified, type GameState } from '../core';
import { el, esc, root } from './hud';
import { popModal, pushModal } from './input';
import { TYPE_LABEL, areaName } from './labels';

export function openViewer(s: GameState, evidenceId: string, onClose: () => void = () => {}) {
  const e = evidenceById.get(evidenceId)!;
  const box = el('div', 'modal viewer'); box.id = 'viewer';
  const ver = isVerified(s, evidenceId) ? '<span class="ver">검증됨</span>' : '<span class="unver">미검증</span>';
  const bg = e.illust ? `<img class="docbg" src="assets/illust/${e.illust}.png" alt="">` : '';
  box.innerHTML = `${bg}<h3 style="margin:0 0 4px;color:#e2c98a;font-size:13px">${esc(e.title)}</h3>
    <div class="meta"><span class="tag t-${e.sourceType}">${TYPE_LABEL[e.sourceType]}</span>${ver} · ${esc(areaName(e.acquiredSceneId))} · ${esc(e.timestamp)}</div>
    ${e.body ? `<div class="docbody">${e.body.map((l) => (l ? `<p>${esc(l)}</p>` : '<br>')).join('')}</div>` : `<p>${esc(e.description)}</p>`}<div class="foot">Enter / Esc / 클릭: 닫기</div>`;
  root().append(box);
  const close = () => { popModal('viewer'); box.remove(); onClose(); };
  box.addEventListener('click', close);
  pushModal({ id: 'viewer', onKey(ev) { if ((ev.key === 'Enter' || ev.key === 'Escape') && !ev.repeat) close(); } });
}
