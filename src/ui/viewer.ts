// 단서 원문 보기 (ClueDetailView 대응). 수첩의 "원문 다시 열기"와 단서 획득 시 사용.
import { shownEvidence, type GameState } from '../core';
import { sfx } from '../audio/audio';
import { el, esc, root } from './hud';
import { popModal, pushModal } from './input';
import { TYPE_LABEL, areaName } from './labels';
import documents from '../data/documents.json';

export function openViewer(s: GameState, evidenceId: string, onClose: () => void = () => {}) {
  const e = shownEvidence(s, evidenceId)!;
  const box = el('div', 'modal viewer'); box.id = 'viewer';
  const photo = !!e.illust?.startsWith('ev_'); // 증거 근접 그림(ev_*)은 흐린 배경이 아니라 오른쪽에 또렷한 사진으로 둔다
  box.classList.toggle('photo', photo);
  const bg = e.illust ? `<img class="docbg${photo ? ' photo' : ''}" src="assets/illust/${e.illust}.webp" alt="">` : '';
  box.innerHTML = `${bg}<h3 style="margin:0 0 4px;color:#e2c98a;font-size:13px">${esc(e.title)}</h3>
    <div class="meta"><span class="tag t-${e.sourceType}">${TYPE_LABEL[e.sourceType]}</span> · ${esc(areaName(e.acquiredSceneId))} · ${esc(e.timestamp)}</div>
    ${e.body ? `<div class="docbody">${e.body.map((l) => (l ? `<p>${esc(l)}</p>` : '<br>')).join('')}</div>` : `<p>${esc(e.description)}</p>`}<div class="foot">Enter / Esc / 클릭: 닫기</div>`;
  root().append(box); sfx('onPageFlip');
  const close = () => { popModal('viewer'); box.remove(); onClose(); };
  box.addEventListener('click', close);
  pushModal({ id: 'viewer', onKey(ev) { if ((ev.key === 'Enter' || ev.key === 'Escape') && !ev.repeat) close(); } });
}

/** 단서가 아닌 맥락 문서(documents.json): 표제·출처·본문을 HTML 로 보여 준다. 수첩에 들어가지 않는다. */
export function openDocument(docId: string, onClose: () => void = () => {}) {
  const d = (documents as Record<string, { title: string; meta: string; body: string[] }>)[docId];
  const box = el('div', 'modal viewer'); box.id = 'viewer'; box.dataset.doc = docId;
  box.innerHTML = `<h3 style="margin:0 0 4px;color:#e2c98a;font-size:13px">${esc(d.title)}</h3><div class="meta"><span class="tag t-context">증거</span> ${esc(d.meta)}</div>
    <div class="docbody">${d.body.map((l) => (l ? `<p>${esc(l)}</p>` : '<br>')).join('')}</div><div class="foot">Enter / Esc / 클릭: 닫기</div>`;
  root().append(box); sfx('onPageFlip');
  const close = () => { popModal('viewer'); box.remove(); onClose(); };
  box.addEventListener('click', close);
  pushModal({ id: 'viewer', onKey(ev) { if ((ev.key === 'Enter' || ev.key === 'Escape') && !ev.repeat) close(); } });
}
