// 대화 오버레이 (바닥선 아래 112px). 타이핑 연출(Enter/클릭으로 즉시 완성), 선택지, 단서 제시(9.2), 진술 3단계(9.3).
import { availableChoices, startNodeOf, characterName, enterNode, shownEvidence, getNode, presentEvidence, type GameState, type Dialogue, type DialogueNode } from '../core';
import { dialogues } from '../explore/content';
import { el, esc, root, showToast } from './hud';
import { popModal, pushModal } from './input';
import { TYPE_LABEL } from './labels';

const CHAR_MS = 22;
type Item = { label: string; run: () => void; disabled?: boolean };

export function hasDialogue(id: string) { return !!dialogues[id]; }

export function openDialogue(s: GameState, dialogueId: string, onClose: (acquired: string[]) => void = () => {}) {
  const d: Dialogue = dialogues[dialogueId];
  const box = el('div', 'dlg'); box.id = 'dialogue';
  root().append(box);

  let nodeId = startNodeOf(s, d);
  let node: DialogueNode;
  let shown = 0, timer = 0, typing = false;
  let items: Item[] = [], sel = 0;
  let msg = '';
  const got: string[] = [];
  let picker: { cursor: number; chosen: Set<string>; list: string[] } | null = null;

  const close = () => { clearInterval(timer); popModal('dialogue'); box.remove(); onClose(got); };

  function go(next: string) { nodeId = next; enter(); }
  function enter() {
    node = getNode(dialogues, dialogueId, nodeId);
    const { acquired } = enterNode(s, node);
    got.push(...acquired);
    for (const id of acquired) showToast(`단서 획득: ${shownEvidence(s, id)!.title}`);
    msg = ''; picker = null; shown = 0; typing = true; items = []; sel = 0;
    clearInterval(timer);
    timer = window.setInterval(() => { shown++; if (shown >= node.text.length) finishTyping(); else render(); }, CHAR_MS);
    render();
  }
  function finishTyping() {
    clearInterval(timer); typing = false; shown = node.text.length;
    const ch = availableChoices(s, node);
    if (ch.length) items = ch.map((c) => ({ label: c.text, run: () => go(c.next) }));
    else items = [node.next ? { label: '계속', run: () => go(node.next!) } : { label: '대화 끝', run: close }];
    if (node.present?.length) items.push({ label: '[단서 제시]', run: openPicker });
    render();
  }
  function openPicker() {
    const list = s.evidenceIds.slice();
    if (!list.length) { msg = '제시할 자료가 없다.'; render(); return; }
    picker = { cursor: 0, chosen: new Set(), list }; render();
  }
  function confirmPicker() {
    if (!picker || !picker.chosen.size) { msg = '제시할 자료를 고른다 (Space).'; render(); return; }
    const r = presentEvidence(s, d, dialogueId, nodeId, [...picker.chosen]);
    if (r.kind === 'ok') go(r.next); else { msg = r.message; picker = null; render(); }
  }

  function textHtml() {
    const t = node.text.slice(0, shown);
    const st = node.statement ? s.statements[node.statement.id] : null;
    if (typing || !st) return esc(t);
    if (st.stage === 'contradiction') return `<span class="st-contradiction">${esc(t)}</span>`;
    if (st.stage === 'revised') return `<span class="st-revised"><s>${esc(st.text)}</s> <b>${esc(st.revisedText ?? '')}</b></span>`;
    return `<span class="st-unconfirmed">“${esc(t)}”</span>`;
  }
  function render() {
    // 초상이 아직 없는 인물은 회색 실루엣 placeholder (한지수·박은호 그림을 대신 쓰지 않는다)
    const portrait = node.portrait ? `<img class="portrait" src="assets/illust/${node.portrait}.png" alt="">`
      : node.speaker !== 'han_jisu' ? '<div class="portrait ph"><i></i><b></b></div>' : '';
    box.className = 'dlg' + (portrait ? ' has-portrait' : '');
    let opts = '';
    if (picker) {
      opts = '<div class="slotlbl">제시할 자료 — ↑↓ 이동 · Space 선택 · Enter 제시 · Esc 취소</div>' +
        picker.list.map((id, i) => {
          const e = shownEvidence(s, id)!;
          return `<button class="opt${i === picker!.cursor ? ' sel' : ''}" data-pi="${i}"><span class="box">${picker!.chosen.has(id) ? '☑' : '☐'}</span><span class="tag t-${e.sourceType}">${TYPE_LABEL[e.sourceType]}</span>${esc(e.title)}</button>`;
        }).join('');
    } else if (!typing) {
      const single = items.length === 1;
      opts = single ? `<div class="cont">▼ Enter</div>` :
        items.map((it, i) => `<button class="opt${i === sel ? ' sel' : ''}${it.disabled ? ' dis' : ''}" data-i="${i}">${i + 1}. ${esc(it.label)}</button>`).join('');
    }
    box.innerHTML = `${portrait}<div class="name">${esc(characterName(node.speaker))}</div><div class="text">${textHtml()}</div><div class="msg">${esc(msg)}</div><div class="opts">${opts}</div>`;
  }

  box.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const pi = t.closest('[data-pi]') as HTMLElement | null;
    if (picker && pi) { picker.cursor = +pi.dataset.pi!; toggle(); return; }
    const i = t.closest('[data-i]') as HTMLElement | null;
    if (typing) { finishTyping(); return; }
    if (i) { sel = +i.dataset.i!; items[sel].run(); return; }
    if (items.length === 1) items[0].run();
  });
  function toggle() {
    if (!picker) return;
    const id = picker.list[picker.cursor];
    if (picker.chosen.has(id)) picker.chosen.delete(id); else if (picker.chosen.size < 3) picker.chosen.add(id);
    render();
  }

  pushModal({
    id: 'dialogue',
    onKey(e) {
      if (picker) {
        if (e.key === 'ArrowDown') picker.cursor = (picker.cursor + 1) % picker.list.length;
        else if (e.key === 'ArrowUp') picker.cursor = (picker.cursor + picker.list.length - 1) % picker.list.length;
        else if (e.key === ' ') toggle();
        else if (e.key === 'Enter' && !e.repeat) { confirmPicker(); return; }
        else if (e.key === 'Escape') picker = null;
        render(); return;
      }
      if (typing) { if (e.key === 'Enter' && !e.repeat) finishTyping(); return; }
      if (e.key === 'ArrowDown') { sel = (sel + 1) % items.length; render(); }
      else if (e.key === 'ArrowUp') { sel = (sel + items.length - 1) % items.length; render(); }
      else if (/^[1-9]$/.test(e.key) && items[+e.key - 1]) { sel = +e.key - 1; items[sel].run(); }
      else if (e.key === 'Enter' && !e.repeat) items[sel]?.run();
    },
  });
  enter();
}
