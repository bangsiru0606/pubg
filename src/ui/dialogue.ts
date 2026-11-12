// 대화 오버레이 (바닥선 아래 112px). 타이핑 연출(Enter/클릭으로 즉시 완성), 선택지, 단서 제시(9.2), 진술 3단계(9.3).
import { availableChoices, openingNodeOf, markDialogueDone, nextOf, characterName, enterNode, shownEvidence, getNode, presentEvidence, type GameState, type Dialogue, type DialogueNode } from '../core';
import { bgmPop, bgmPush, dialogueTrack, nodeSfx, sfx } from '../audio/audio';
import { dialogues } from '../explore/content';
import { characters, characterLabel, fmtName } from '../core';
import illustList from '../data/illust-list.json'; // 초상 파일이 아직 없으면 회색 실루엣 placeholder
import { el, esc, root, showToast } from './hud';
import { popModal, pushModal } from './input';
import { logLine, openBacklog } from './backlog';
import { TYPE_LABEL } from './labels';

const CHAR_MS = 22;
type Item = { label: string; run: () => void; disabled?: boolean };

/** 초상 파일 접두사(player·eunho·baek…) → 원래 보는 방향 (characters.json portraitFacing). 초상은 대화창 왼쪽에 있으므로 오른쪽(화면 안쪽)을 보게 한다. */
const FACING = Object.fromEntries((characters as unknown as { portrait: string | null; portraitFacing?: string }[]).filter((c) => c.portrait).map((c) => [c.portrait, c.portraitFacing ?? 'front']));
export const portraitFlipped = (key: string) => FACING[key.split('_')[0]] === 'left';
export function hasDialogue(id: string) { return !!dialogues[id]; }

/** 대화가 끝난 뒤 이어지는 장면(Dialogue.then)을 처리하는 쪽 (탐색 장면이 등록한다) */
let thenHandler: (then: string) => void = () => {};
export const setThenHandler = (f: (then: string) => void) => { thenHandler = f; };

export function openDialogue(s: GameState, dialogueId: string, onClose: (acquired: string[]) => void = () => {}, startAt?: string) { // startAt: 시험·스크린샷용으로 중간 노드에서 연다
  const d: Dialogue = dialogues[dialogueId];
  const box = el('div', 'dlg'); box.id = 'dialogue';
  root().append(box);
  bgmPush('dialogue', dialogueTrack(dialogueId)); // 심문·고백·보고 대화는 전용 음악 (없으면 구역 음악 그대로)

  let nodeId = startAt ?? openingNodeOf(s, d, dialogueId);
  let node: DialogueNode;
  let shown = 0, timer = 0, typing = false;
  let items: Item[] = [], sel = 0;
  let msg = '';
  const got: string[] = [];
  let picker: { cursor: number; chosen: Set<string>; list: string[] } | null = null;

  const close = () => { markDialogueDone(s, d, dialogueId); clearInterval(timer); bgmPop('dialogue'); popModal('dialogue'); box.remove(); onClose(got); if (d.then) thenHandler(d.then); };

  function go(next: string) { nodeId = next; enter(); }
  function enter() {
    node = getNode(dialogues, dialogueId, nodeId);
    const { acquired } = enterNode(s, node);
    got.push(...acquired);
    logLine(node.speaker, fmtName(node.text), node.voice);
    nodeSfx(dialogueId, nodeId);
    if (acquired.length) sfx('onEvidenceGet');
    if (node.onEnter?.contradict?.length) sfx('onStatementUpdate');
    for (const id of acquired) showToast(`단서 획득: ${shownEvidence(s, id)!.title}`);
    msg = ''; picker = null; shown = 0; typing = true; items = []; sel = 0;
    clearInterval(timer);
    timer = window.setInterval(() => { shown++; if (shown % 3 === 0 && node.text[shown - 1] !== ' ') sfx('onTypeBlip'); if (shown >= node.text.length) finishTyping(); else render(); }, CHAR_MS);
    render();
  }
  function finishTyping() {
    clearInterval(timer); typing = false; shown = node.text.length;
    const ch = availableChoices(s, node);
    if (ch.length) items = ch.map((c) => ({ label: c.text, run: () => { sfx('onUiConfirm'); go(c.next); } }));
    else { const nx = nextOf(s, node); items = [nx ? { label: '계속', run: () => go(nx) } : { label: '대화 끝', run: close }]; }
    if (node.present?.length) items.push({ label: '[단서 제시]', run: openPicker });
    render();
  }
  function openPicker() {
    const list = s.evidenceIds.slice();
    if (!list.length) { msg = '제시할 자료가 없다.'; render(); return; }
    picker = { cursor: 0, chosen: new Set(), list }; render();
  }
  function confirmPicker() {
    if (!picker || !picker.chosen.size) { msg = '제시할 자료를 고른 뒤 [제시하기]를 선택한다.'; render(); return; }
    const r = presentEvidence(s, d, dialogueId, nodeId, [...picker.chosen]);
    if (r.kind === 'ok') go(r.next); else { msg = r.message; picker = null; render(); }
  }

  function textHtml() {
    const t = node.text.slice(0, shown);
    if (node.voice === 'message') return `<span class="voice voice-message">${esc(t)}</span>`; // 받은 메시지: 괄호 없이 띠 안에 그대로
    if (node.voice) return `<span class="voice voice-${node.voice}">(${esc(t)}${typing ? '' : ')'}</span>`; // 생각·행동 묘사는 ( ) 로 감싸 실제 말과 구분한다
    const st = node.statement ? s.statements[node.statement.id] : null;
    if (typing || !st) return esc(t);
    if (st.stage === 'contradiction') return `<span class="st-contradiction">${esc(t)}</span>`;
    if (st.stage === 'revised') return `<span class="st-revised"><s>${esc(st.text)}</s> <b>${esc(st.revisedText ?? '')}</b></span>`;
    return `<span class="st-unconfirmed">“${esc(t)}”</span>`;
  }
  function render() {
    // 초상이 아직 없는 인물은 회색 실루엣 placeholder (한지수·박은호 그림을 대신 쓰지 않는다)
    const msgBand = node.voice === 'message';
    const portrait = node.noPortrait || msgBand ? '' : node.portrait && illustList.includes(node.portrait) ? `<img class="portrait${portraitFlipped(node.portrait) ? ' flip' : ''}" src="assets/illust/${node.portrait}.webp" alt="">`
      : node.speaker !== 'han_jisu' ? '<div class="portrait ph"><i></i><b></b></div>' : '';
    box.className = 'dlg' + (portrait ? ' has-portrait' : '') + (picker ? ' picking' : '') + (msgBand ? ' message' : '');
    let opts = '';
    if (picker) {
      opts = [...picker.list.map((id, i) => {
          const e = shownEvidence(s, id)!;
          return `<button class="opt${i === picker!.cursor ? ' sel' : ''}" data-pi="${i}"><span class="box">${picker!.chosen.has(id) ? '☑' : '☐'}</span><span class="tag t-${e.sourceType}">${TYPE_LABEL[e.sourceType]}</span>${esc(e.title)}</button>`;
        }), `<button class="opt${picker.cursor === picker.list.length ? ' sel' : ''}" data-pi="${picker.list.length}">[제시하기] (${picker.chosen.size}개 선택)</button>`]
          .join(''); // 모두 그리고, 길면 이 칸만 스크롤한다 (선택한 줄은 아래에서 보이게 맞춘다)
    } else if (!typing) {
      const single = items.length === 1 && !availableChoices(s, node).length; // 선택지가 하나뿐이어도 문장은 보여 준다
      opts = single ? `<div class="cont">▼ Enter</div>` :
        items.map((it, i) => `<button class="opt${i === sel ? ' sel' : ''}${it.disabled ? ' dis' : ''}" data-i="${i}">${i + 1}. ${esc(it.label)}</button>`).join('');
    }
    const keep = (box.querySelector('.opts') as HTMLElement | null)?.scrollTop ?? 0; // 다시 그려도 스크롤 위치를 지킨다
    box.innerHTML = `${portrait}<button class="logbtn" data-log type="button">[L] 기록</button><div class="name">${msgBand ? `✉ ${esc(characterName(node.speaker))}의 메시지` : esc(characterLabel(node.speaker))}</div><div class="text">${textHtml()}</div><div class="msg">${esc(msg)}</div>${picker ? '<div class="slotlbl">제시할 자료 — ↑↓ 이동 · Enter/Space 선택 · [제시하기]에서 Enter · Esc 취소</div>' : ''}<div class="opts">${opts}</div>`;
    const list = box.querySelector('.opts') as HTMLElement | null, cur = list?.querySelector('.opt.sel') as HTMLElement | null;
    if (list) { list.scrollTop = keep; if (cur) { const top = cur.offsetTop, bottom = top + cur.offsetHeight; if (top < list.scrollTop) list.scrollTop = top; else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight; } } // 선택한 항목이 항상 보이게
  }

  box.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-log]')) { openBacklog(); return; }
    const pi = t.closest('[data-pi]') as HTMLElement | null;
    if (picker && pi) { picker.cursor = +pi.dataset.pi!; toggle(); return; }
    const i = t.closest('[data-i]') as HTMLElement | null;
    if (typing) { finishTyping(); return; }
    if (i) { sel = +i.dataset.i!; items[sel].run(); return; }
    if (items.length === 1) items[0].run();
  });
  function toggle() {
    if (!picker) return;
    if (picker.cursor === picker.list.length) { confirmPicker(); return; }
    const id = picker.list[picker.cursor];
    if (picker.chosen.has(id)) picker.chosen.delete(id); else if (picker.chosen.size < 3) picker.chosen.add(id);
    render();
  }

  pushModal({
    id: 'dialogue',
    onKey(e) {
      if ((e.key === 'l' || e.key === 'L') && !e.repeat) { openBacklog(); return; }
      if (picker) {
        const n = picker.list.length + 1; // 마지막 행 = [제시하기]
        if (e.key === 'ArrowDown') picker.cursor = (picker.cursor + 1) % n;
        else if (e.key === 'ArrowUp') picker.cursor = (picker.cursor + n - 1) % n;
        else if (e.key === ' ') toggle();
        else if (e.key === 'Enter' && !e.repeat) { if (picker.cursor === picker.list.length) { confirmPicker(); return; } toggle(); }
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
