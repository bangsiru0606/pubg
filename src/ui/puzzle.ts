// 퍼즐 화면 (공통 틀 + 배치 5종). 판정은 src/core 의 submitPuzzle 만 쓴다. 화면 구성은 puzzles.json 데이터.
//  plan     P01: 단서 조각(인용 문장)을 평면도의 위치에 놓고, 모두 놓으면 "무엇이 옮겨졌나?"를 고른다
//  timeline P02: 진술·기록 조각을 시간 칸에 놓는다 (시각이 없는 조각은 순서로 추론)
//  desktop  P03: 부원장 PC 바탕화면 — 파일·휴지통·문서 비교 프로그램을 열어 바뀐 줄을 찾고, 수정이 숨기려 한 사실을 고른다
//  tree     P04: 승인 체계 트리 — 서식 문구(약자·권한)를 보고 인물 카드를 칸에 놓는다
//  logic    P05: 후보 표와 대조 (조각 표시만 통일)
//  quiz     P01: 추리 문답 — 질문에 판단+이유 선택지로 답하며 결론에 이른다. 고르는 동안 맞고 틀림을 알리지 않고, 확정 전에는 이전 질문으로 돌아갈 수 있다
// 결론은 [결론 확정] → 확인 창으로만 낸다. 확정은 한 번뿐이고 결과(맞고 틀림)는 화면에 내지 않는다. [보류하고 나가기]는 벌점 없이 놓은 조각을 저장한다.
// 마우스: 조각 드래그 / 클릭 → 칸 클릭. 키보드: ←→ 선택 → Enter 로 잡기 → ←→ 위치 → Enter 로 놓기.
import {
  availablePieces, isAnswerComplete, puzzleById, puzzleDraftOf, quizConclusion, quizWalk, savePuzzleDraft, setFlag, shownEvidence, sourceName, submitPuzzle,
  type GameState, type PuzzleAnswer, type PuzzlePiece, type PuzzleTask,
} from '../core';
import { el, esc, root } from './hud';
import { bgmPop, bgmPush, puzzleTrack, sfx } from '../audio/audio';
import { popModal, pushModal } from './input';
import { openViewer } from './viewer';
import { openNotebook } from './notebook';

type Focus = { kind: 'piece' | 'person' | 'chip' | 'cycle' | 'icon' | 'cmp' | 'src' | 'submit' | 'hold' | 'choice' | 'back' | 'clues'; id: string };
const TRAY = 'tray';
export const RULE_TEXT = '사건 재구성은 단서가 사라지기 전에 해야 한다. 결론은 한 번만 확정할 수 있다.';

export function openPuzzle(s: GameState, puzzleId: string, onClose: (solved: boolean) => void) {
  const p = puzzleById.get(puzzleId)!;
  const layout = p.layout ?? 'plan';
  const tasks = p.tasks ?? [];
  const placeTasks = tasks.filter((t) => t.kind === 'place');
  const markTasks: PuzzleTask[] = tasks.filter((t) => t.kind === 'mark');
  const pieceLayout = layout === 'plan' || layout === 'timeline';
  const people = p.people ?? [];
  const desk = p.desktop;

  // ---- 상태: ans[칸] = 그 칸에 놓은 조각·인물·표시 (draft 로 저장되는 형식과 같다) ----
  const ans: PuzzleAnswer = JSON.parse(JSON.stringify(puzzleDraftOf(s, puzzleId)));
  let note = '';
  let phase: 'play' | 'done' = 'play';
  let grabbed: string | null = null, grabZone: string | null = null; // 키보드로 잡은 조각/인물과 지금 가리키는 칸
  let fi = 0;
  let confirming = false, confirmSel = 0;
  let rule = !s.flags.includes('puzzle_rule_seen');
  const isQuiz = layout === 'quiz';
  const qpath = () => ans.path ?? [];
  function choose(id: string) { ans.path = [...qpath(), id]; note = ''; fi = 0; render(); }
  function goBack(to = qpath().length - 1) { if (to < 0) return; ans.path = qpath().slice(0, to); note = ''; fi = 0; render(); }

  const pieces = (): PuzzlePiece[] => availablePieces(s, p);
  const zoneOf = (id: string) => Object.keys(ans).find((k) => ans[k]?.includes(id));
  const zoneList = (): { id: string; label: string }[] =>
    layout === 'plan' ? [...(p.zones ?? []).map((z) => ({ id: z.id, label: z.label })), { id: TRAY, label: '조각 보관' }]
    : layout === 'timeline' ? [...(p.boxes ?? []).map((b) => ({ id: b.id, label: b.label })), { id: TRAY, label: '조각 보관' }]
    : layout === 'tree' ? tasks.map((t) => ({ id: t.slot, label: t.label })) : [];
  const unplaced = () => pieces().filter((t) => !zoneOf(t.id));

  function put(id: string, zone: string) {
    if (layout === 'tree') { ans[zone] = [id]; }
    else {
      for (const k of Object.keys(ans)) ans[k] = (ans[k] ?? []).filter((x) => x !== id);
      if (zone !== TRAY) { if (layout === 'timeline') for (const old of ans[zone] ?? []) ans[zone] = ans[zone].filter((x) => x !== old); ans[zone] = [...(ans[zone] ?? []), id]; }
    }
    grabbed = null; grabZone = null; note = ''; render();
  }
  function toggleChip(slot: string, id: string, single = false) {
    const a = ans[slot] ?? []; const i = a.indexOf(id);
    ans[slot] = single ? (i >= 0 ? [] : [id]) : i >= 0 ? a.filter((x) => x !== id) : [...a, id];
    note = ''; render();
  }
  // 드롭다운 (P03): 칸을 누르면 그 칸 바로 아래에 후보 목록이 펼쳐진다. ↑↓ Enter 로도 고른다.
  let ddSlot: string | null = null, ddi = 0;
  const openDd = (slot: string) => { if (ddSlot === slot) { ddSlot = null; render(); return; } const t = tasks.find((q) => q.slot === slot)!; ddSlot = slot; ddi = Math.max(0, t.options.findIndex((o) => o.id === (ans[slot] ?? [])[0])); render(); };
  const pickDd = (slot: string, id: string) => { ans[slot] = [id]; ddSlot = null; note = ''; render(); };
  const placeSlotsFilled = () => p.slots.filter((sl) => !markTasks.some((t) => t.slot === sl)).every((sl) => !!ans[sl]?.length);
  const complete = () => isAnswerComplete(p, ans);

  const box = el('div', 'modal puzzle'); box.id = 'puzzle'; box.dataset.pid = puzzleId; // 개발용 플레이 기록이 어느 퍼즐인지 읽는다
  root().append(box); bgmPush('puzzle', puzzleTrack());

  // ---- 바탕화면(P03) 상태 ----
  type Win = { id: string; kind: 'file' | 'trash' | 'compare'; ref: string; x: number; y: number; z: number };
  let wins: Win[] = []; let zTop = 1;
  let cmpA = -1, cmpB = -1, cmpRan = false, trashSeen = false;
  const deskFiles = () => desk?.files ?? [];
  const cmpFiles = () => deskFiles().filter((f) => !f.inTrash || trashSeen);
  const fileLines = (f: { evidenceId?: string; lines?: string[] }) => f.lines ?? shownEvidence(s, f.evidenceId!)?.body ?? [];
  function openWin(kind: Win['kind'], ref: string) {
    const ex = wins.find((w) => w.kind === kind && w.ref === ref);
    if (ex) ex.z = ++zTop; else wins.push({ id: `${kind}:${ref}`, kind, ref, x: 74 + wins.length * 8, y: 4 + wins.length * 8, z: ++zTop });
    if (kind === 'trash') trashSeen = true;
    render();
  }

  const focusList = (): Focus[] => {
    if (phase !== 'play') return [];
    const out: Focus[] = [];
    if (pieceLayout) out.push(...pieces().map((t) => ({ kind: 'piece' as const, id: t.id })));
    if (layout === 'tree') out.push(...people.map((q) => ({ kind: 'person' as const, id: q.id })));
    if (layout === 'logic') out.push(...placeTasks.map((t) => ({ kind: 'person' as const, id: t.slot })));
    if (isQuiz) { const w = quizWalk(p, qpath()); if (w.at) out.push(...p.quiz!.nodes[w.at].choices.map((c) => ({ kind: 'choice' as const, id: c.id }))); if (qpath().length) out.push({ kind: 'back', id: 'back' }); out.push({ kind: 'clues', id: 'clues' }); }
    if (layout === 'desktop') {
      out.push(...deskFiles().filter((f) => !f.inTrash).map((f) => ({ kind: 'icon' as const, id: `file:${f.id}` })), { kind: 'icon', id: 'trash' }, { kind: 'icon', id: 'compare' });
      if (wins.some((w) => w.kind === 'compare')) out.push({ kind: 'cmp', id: 'a' }, { kind: 'cmp', id: 'b' }, { kind: 'cmp', id: 'run' });
      out.push(...markTasks.map((t) => ({ kind: 'cycle' as const, id: t.slot })));
    } else if (!pieceLayout || placeSlotsFilled()) {
      out.push(...markTasks.flatMap((t) => t.options.map((o) => ({ kind: 'chip' as const, id: `${t.slot}|${o.id}` }))));
    }
    out.push(...p.sourceEvidenceIds.filter((id) => s.evidenceIds.includes(id) && layout !== 'desktop').map((id) => ({ kind: 'src' as const, id })), { kind: 'hold', id: 'hold' }, { kind: 'submit', id: 'submit' });
    return out;
  };
  const isFocus = (kind: Focus['kind'], id: string) => { const f = focusList()[fi]; return !!f && f.kind === kind && f.id === id; };
  const fcls = (kind: Focus['kind'], id: string) => (isFocus(kind, id) ? ' foc' : '');

  const pcHtml = (t: PuzzlePiece) => `<span class="pc${t.decoy ? '' : ''}${grabbed === t.id ? ' grab' : ''}${fcls('piece', t.id)}" data-piece="${esc(t.id)}">${esc(t.label)}<i>‹${esc(sourceName(s, t))}›</i></span>`;
  const personHtml = (q: { id: string; label: string }, n = '') => `<span class="pc person${grabbed === q.id ? ' grab' : ''}${fcls('person', q.id)}" data-person="${esc(q.id)}">${esc(q.label)}${n}</span>`;

  // ---- 그리기 ----
  function mainHtml(): string {
    if (layout === 'quiz') {
      const w = quizWalk(p, qpath()), q = p.quiz!;
      if (!w.at) return `<div class="slotlbl">지나온 판단을 한 문장으로 정리하면:</div><div class="qconc">${esc(quizConclusion(p, qpath()))}</div><div class="slotlbl">확신이 없으면 이전 질문으로 돌아가 다시 고를 수 있다. [결론 확정]은 한 번만 누를 수 있다.</div>`;
      return q.nodes[w.at].choices.map((c) => `<button class="qc${fcls('choice', c.id)}" data-choice="${esc(c.id)}"><b>${esc(c.judge)}</b></button>`).join('');
    }
    if (layout === 'plan') {
      return `<div class="pz-grid">${(p.zones ?? []).map((z) => `<div class="zone" data-zone="${z.id}" style="left:${z.x}%;top:${z.y}%;width:${z.w}%;height:${z.h}%"><span class="zl">${esc(z.label)}</span>${pieces().filter((t) => zoneOf(t.id) === z.id).map(pcHtml).join('')}</div>`).join('')}</div>`;
    }
    if (layout === 'timeline') {
      const n = p.boxes!.length;
      return `<div class="pz-grid">${p.boxes!.map((b, i) => `<div class="zone tl" data-zone="${b.id}" style="left:${i * (100 / n)}%;width:${100 / n - 1}%"><span class="zl">${esc(b.label)}</span>${pieces().filter((t) => zoneOf(t.id) === b.id).map(pcHtml).join('')}</div>`).join('')}</div>`;
    }
    if (layout === 'tree') {
      const slotHtml = (t: PuzzleTask, cls: string) => {
        const who = people.find((q) => q.id === (ans[t.slot] ?? [])[0]);
        return `<div class="zone node ${cls}" data-zone="${t.slot}"><span class="zl">${esc(t.label)}</span><span class="form">${esc(t.form ?? '')}<i>‹${esc(sourceName(s, { source: t.formSource ?? '' }))}›</i></span>${who ? `<span class="pc person placed" data-clear="${t.slot}">${esc(who.label)}</span>` : '<span class="slotlbl">(인물 카드를 놓는다)</span>'}</div>`;
      };
      const [root0, ...kids] = placeTasks;
      return `<div class="pz-tree">${slotHtml(root0, 'root')}<div class="tline"></div><div class="kids">${kids.map((t) => slotHtml(t, 'kid')).join('')}</div></div>`;
    }
    if (layout === 'logic') {
      const cols = p.table!.columns.map((c) => `<th>${esc(c)}</th>`).join('');
      const rows = p.table!.rows.map((row) => {
        const here = (ans.identity ?? []).includes(row.id) ? `<span class="pc person placed${fcls('person', 'identity')}" data-token="identity">P-271</span>` : '';
        return `<tr class="zone" data-zone="${row.id}"><td>${esc(row.cells[0])} ${here}</td>${row.cells.slice(1).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`;
      }).join('');
      const tray = (ans.identity ?? []).length ? '' : `<span class="pc person${grabbed === 'identity' ? ' grab' : ''}${fcls('person', 'identity')}" data-token="identity">P-271</span>`;
      return `<table class="ltab"><tr>${cols}</tr>${rows}</table><div class="ltray"><span class="slotlbl">토큰:</span> ${tray || '<span class="slotlbl">배치했다 (표의 토큰을 누르면 뗀다)</span>'}</div>`;
    }
    return deskHtml();
  }
  function deskHtml(): string {
    const icons = [...deskFiles().filter((f) => !f.inTrash).map((f) => ({ id: `file:${f.id}`, name: f.name, glyph: f.evidenceId ? '▤' : '▥' })), { id: 'trash', name: desk!.trashName, glyph: '🗑' }, { id: 'compare', name: desk!.compareName, glyph: '⇄' }];
    const iconHtml = icons.map((ic) => `<button class="dicon${fcls('icon', ic.id)}" data-icon="${esc(ic.id)}"><b>${ic.glyph}</b><span>${esc(ic.name)}</span></button>`).join('');
    const winHtml = [...wins].sort((a, b) => a.z - b.z).map((w) => {
      let title = '', body = '';
      if (w.kind === 'file') { const f = deskFiles().find((x) => x.id === w.ref)!; title = f.name; body = `<div class="wdoc">${fileLines(f).map((l) => (l ? `<p>${esc(l)}</p>` : '<br>')).join('')}</div>`; }
      else if (w.kind === 'trash') { title = desk!.trashName; body = `<div class="wlist">${deskFiles().filter((f) => f.inTrash).map((f) => `<button class="dicon small" data-wfile="${f.id}"><b>▤</b><span>${esc(f.name)}</span></button>`).join('')}</div>`; }
      else {
        title = desk!.compareName; const fs = cmpFiles();
        const sel = (k: 'a' | 'b', v: number) => `<button class="cmpsel${fcls('cmp', k)}" data-cmp="${k}">${k === 'a' ? '이전 판' : '이후 판'}: ${v >= 0 && fs[v] ? esc(fs[v].name) : '(선택)'}</button>`;
        const res = cmpRan ? desk!.diffs.map((d) => `<div class="diff"><s>${esc(d.before)}</s><b>${esc(d.after)}</b></div>`).join('') || '<div class="slotlbl">바뀐 줄이 없다.</div>' : '<div class="slotlbl">두 파일을 고르고 [비교 실행]을 누른다.</div>';
        body = `<div class="wcmp">${sel('a', cmpA)}${sel('b', cmpB)}<button class="cmpsel run${fcls('cmp', 'run')}" data-cmp="run">비교 실행</button>${res}</div>`;
      }
      return `<div class="win" data-win="${w.id}" style="left:${w.x}px;top:${w.y}px;z-index:${w.z}"><div class="wtitle" data-wdrag="${w.id}"><span>${esc(title)}</span><button data-wclose="${w.id}">×</button></div>${body}</div>`;
    }).join('');
    return `<div class="desk"><div class="dicons">${iconHtml}</div>${winHtml}<div class="taskbar"><span class="start">시작</span><span class="tclock">23:52</span></div></div>`;
  }
  function sideHtml(): string {
    if (layout === 'quiz') { const ch = quizWalk(p, qpath()).chosen; return `<div class="slotlbl">지나온 판단 (누르면 그 질문으로 돌아간다)</div>${ch.map((c, i) => `<button class="qt" data-trail="${i}">${i + 1}. ${esc(c.short)}</button>`).join('') || '<div class="slotlbl">(아직 없다)</div>'}${ch.length ? `<button class="qb${fcls('back', 'back')}" data-back>← 이전 질문으로 <kbd>Bksp</kbd></button>` : ''}<button class="qb${fcls('clues', 'clues')}" data-clues>단서 보기 <kbd>Tab</kbd></button>`; }
    if (pieceLayout) { const u = unplaced(); return `<div class="slotlbl">단서 조각 — 놓지 않은 조각</div>${u.map(pcHtml).join('') || '<div class="slotlbl">모두 놓았다</div>'}`; }
    if (layout === 'tree') return `<div class="slotlbl">인물 카드 (같은 카드를 여러 칸에 놓을 수 있다)</div>${people.map((q) => personHtml(q)).join('')}`;
    if (layout === 'desktop') return markTasks.map((t) => { const cur = t.options.find((o) => o.id === (ans[t.slot] ?? [])[0]), open = ddSlot === t.slot; return `<div class="ctask"><div class="slotlbl">${esc(t.label)}</div><button class="cyc${fcls('cycle', t.slot)}" data-cycle="${t.slot}">${cur ? esc(cur.label) : '(눌러서 고른다)'} ▾</button>${open ? `<div class="ddl">${t.options.map((o, i) => `<button class="ddo${i === ddi ? ' foc' : ''}${cur?.id === o.id ? ' on' : ''}" data-opt="${t.slot}|${esc(o.id)}">${esc(o.label)}</button>`).join('')}</div>` : ''}</div>`; }).join('');
    return '';
  }
  function bottomHtml(): string {
    const chips = markTasks.length && layout !== 'desktop' && (!pieceLayout || placeSlotsFilled())
      ? markTasks.map((t) => `<div class="trow">${esc(t.label)}: ${t.options.map((o) => { const key = `${t.slot}|${o.id}`, on = (ans[t.slot] ?? []).includes(o.id); return `<button class="chip${on ? ' on' : ''}${fcls('chip', key)}" data-chip="${esc(key)}">${on ? '☑' : '☐'} ${esc(o.label)}</button>`; }).join('')}</div>`).join('')
      : pieceLayout && markTasks.length ? '<div class="slotlbl">모든 위치에 조각을 놓으면 다음 질문이 나온다.</div>' : '';
    const srcs = layout === 'desktop' ? '' : p.sourceEvidenceIds.filter((id) => s.evidenceIds.includes(id)).map((id) => `<button class="src${fcls('src', id)}" data-src="${id}">${esc(shownEvidence(s, id)!.title)}</button>`).join('');
    let fb = '';
    const think = layout === 'quiz' ? (() => { const w = quizWalk(p, qpath()); return `<div class="qthink">(${esc(w.at ? p.quiz!.nodes[w.at].q : '여기까지 정리하면 이렇게 된다… 이대로 확정해도 될까.')})</div>`; })() : '';
    fb = note ? `<div class="note">${esc(note)}</div>` : '';
    const btns = phase === 'play' ? `<button class="hold${fcls('hold', 'hold')}" data-hold>보류하고 나가기 <kbd>Esc</kbd></button><button class="submit${complete() ? '' : ' off'}${fcls('submit', 'submit')}" data-submit${complete() ? '' : ' disabled'}>결론 확정</button>` : '';
    const dinfo = layout === 'desktop' ? `<div class="pz-info">${(p.info ?? []).map((l) => `<div>· ${esc(l)}</div>`).join('')}</div>` : '';
    return `${think}${dinfo}<div class="pz-q">${chips}</div><div class="pz-src">${srcs}</div><div class="pz-fb">${fb}</div><div class="pz-btns">${btns}</div>`;
  }
  function overlayHtml(): string {
    if (rule) return `<div class="pz-ov"><div class="ovbox"><div class="ovt">퍼즐 규칙</div><p>${esc(RULE_TEXT)}</p><div class="ovb"><button class="foc" data-rule>확인 <kbd>Enter</kbd></button></div></div></div>`;
    if (confirming) return `<div class="pz-ov"><div class="ovbox"><div class="ovt">결론 확정</div><p>한 번 확정하면 바꿀 수 없다. 확정할까요?</p><div class="ovb"><button class="${confirmSel === 0 ? 'foc' : ''}" data-confirm="yes">확정 <kbd>Enter</kbd></button><button class="${confirmSel === 1 ? 'foc' : ''}" data-confirm="no">취소 <kbd>Esc</kbd></button></div></div></div>`;
    return '';
  }
  function render() {
    box.className = `modal puzzle lay-${layout}`;
    box.innerHTML = `<div class="ptitle">${esc(p.title ?? '')}<span class="psub">${layout === 'desktop' ? '' : esc((p.info ?? []).join(' · '))}</span></div>
      <div class="pz-main">${mainHtml()}</div><div class="pz-side">${sideHtml()}</div><div class="pz-bottom">${bottomHtml()}</div>
      <div class="foot">${grabbed ? '←→ 위치 선택 · Enter 놓기 · Esc 취소' : isQuiz ? '↑↓ 선택 · Enter 고르기 · Backspace 이전 질문 · Tab 단서 보기 · Esc 보류하고 나가기' : '←→ 선택 · Enter 잡기/표시/열기 · Esc 보류하고 나가기 · 마우스: 드래그·클릭'}</div>${overlayHtml()}`;
    box.querySelector('.ddo.foc')?.scrollIntoView({ block: 'nearest' }); // 열린 드롭다운에서 고른 항목이 보이게
  }

  // ---- 동작 ----
  function submit() {
    confirming = false;
    const r = submitPuzzle(s, puzzleId, JSON.parse(JSON.stringify(ans)));
    if (r.status === 'incomplete') { note = '모든 칸을 채운 뒤에 확정할 수 있다.'; grabbed = null; render(); return; }
    sfx('onPuzzleConfirm'); phase = 'done'; close(); // 맞든 틀리든 같은 반응: 닫고 독백만 나온다
  }
  const close = () => {
    if (phase === 'play') savePuzzleDraft(s, puzzleId, ans); // 보류: 놓은 조각 저장, 기회·벌점 없음
    bgmPop('puzzle'); popModal('puzzle'); box.remove(); onClose(phase === 'done');
  };
  function activate() {
    const f = focusList()[fi]; if (!f) return;
    if (f.kind === 'piece' || f.kind === 'person') { grabbed = f.id; grabZone = layout === 'logic' ? p.table!.rows[0].id : zoneList()[0]?.id ?? null; render(); }
    else if (f.kind === 'choice') choose(f.id);
    else if (f.kind === 'back') goBack();
    else if (f.kind === 'clues') showClues();
    else if (f.kind === 'chip') { const [slot, id] = f.id.split('|'); toggleChip(slot, id, !!tasks.find((t) => t.slot === slot)?.single); }
    else if (f.kind === 'cycle') openDd(f.id);
    else if (f.kind === 'icon') { if (f.id === 'trash') openWin('trash', 'trash'); else if (f.id === 'compare') openWin('compare', 'cmp'); else openWin('file', f.id.slice(5)); }
    else if (f.kind === 'cmp') cmpAction(f.id);
    else if (f.kind === 'src') openViewer(s, f.id);
    else if (f.kind === 'hold') close();
    else if (complete()) { confirming = true; confirmSel = 0; render(); }
  }
  /** 가진 단서를 다시 확인한다 (수첩). 닫으면 문답으로 돌아온다 */
  function showClues() { openNotebook(s, () => render(), 0); }
  function cmpAction(k: string) {
    const n = cmpFiles().length;
    if (k === 'a') cmpA = (cmpA + 1) % Math.max(n, 1); else if (k === 'b') cmpB = (cmpB + 1) % Math.max(n, 1);
    else if (cmpA >= 0 && cmpB >= 0 && cmpA !== cmpB) cmpRan = true; else note = '서로 다른 두 파일을 고른 뒤 비교한다.';
    if (k !== 'run') cmpRan = false;
    render();
  }

  box.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (rule) { if (t.closest('[data-rule]')) { rule = false; setFlag(s, 'puzzle_rule_seen'); render(); } return; }
    if (confirming) { const c = t.closest('[data-confirm]') as HTMLElement | null; if (c) { if (c.dataset.confirm === 'yes') submit(); else { confirming = false; render(); } } return; }
    const z = t.closest('[data-zone]') as HTMLElement | null;
    if (grabbed && z && !t.closest('[data-clear]')) { if (layout === 'logic') { ans.identity = [z.dataset.zone!]; grabbed = null; render(); } else put(grabbed, z.dataset.zone!); return; }
    if (t.closest('[data-hold]')) { close(); return; }
    if (t.closest('[data-submit]')) { if (complete()) { confirming = true; confirmSel = 0; render(); } return; }
    const clr = t.closest('[data-clear]') as HTMLElement | null; if (clr) { delete ans[clr.dataset.clear!]; render(); return; }
    const ch = t.closest('[data-choice]') as HTMLElement | null; if (ch) { choose(ch.dataset.choice!); return; }
    const tr = t.closest('[data-trail]') as HTMLElement | null; if (tr) { goBack(+tr.dataset.trail!); return; }
    if (t.closest('[data-back]')) { goBack(); return; }
    if (t.closest('[data-clues]')) { showClues(); return; }
    const chip = t.closest('[data-chip]') as HTMLElement | null; if (chip) { const [slot, id] = chip.dataset.chip!.split('|'); toggleChip(slot, id, !!tasks.find((q) => q.slot === slot)?.single); return; }
    const opt = t.closest('[data-opt]') as HTMLElement | null; if (opt) { const [slot, id] = opt.dataset.opt!.split('|'); pickDd(slot, id); return; }
    const cyc = t.closest('[data-cycle]') as HTMLElement | null; if (cyc) { openDd(cyc.dataset.cycle!); return; }
    if (ddSlot) { ddSlot = null; render(); }
    const src = t.closest('[data-src]') as HTMLElement | null; if (src) { openViewer(s, src.dataset.src!); return; }
    const cm = t.closest('[data-cmp]') as HTMLElement | null; if (cm) { cmpAction(cm.dataset.cmp!); return; }
    const wc = t.closest('[data-wclose]') as HTMLElement | null; if (wc) { wins = wins.filter((w) => w.id !== wc.dataset.wclose); render(); return; }
    const wf = t.closest('[data-wfile]') as HTMLElement | null; if (wf) { openWin('file', wf.dataset.wfile!); return; }
    const win = t.closest('[data-win]') as HTMLElement | null; if (win) { const w = wins.find((q) => q.id === win.dataset.win); if (w && w.z !== zTop) { w.z = ++zTop; render(); } }
    const tok = t.closest('[data-token]') as HTMLElement | null; if (tok) { if (layout === 'logic') { if ((ans.identity ?? []).length) { delete ans.identity; grabbed = null; } else grabbed = grabbed ? null : 'identity'; render(); } return; }
    const pc = t.closest('[data-piece],[data-person]') as HTMLElement | null;
    if (pc) { const k = pc.dataset.piece ?? pc.dataset.person!; grabbed = grabbed === k ? null : k; render(); }
  });
  box.addEventListener('dblclick', (e) => { const ic = (e.target as HTMLElement).closest('[data-icon]') as HTMLElement | null; if (ic && phase === 'play' && !rule && !confirming) { const id = ic.dataset.icon!; if (id === 'trash') openWin('trash', 'trash'); else if (id === 'compare') openWin('compare', 'cmp'); else openWin('file', id.slice(5)); } });

  // 드래그: 조각·인물 카드 → 칸, 창 제목줄 → 창 이동
  box.addEventListener('pointerdown', (e) => {
    if (phase !== 'play' || rule || confirming) return;
    const target = e.target as HTMLElement;
    const k = root().getBoundingClientRect().width / 480;
    const sx = e.clientX, sy = e.clientY;
    const wd = target.closest('[data-wdrag]') as HTMLElement | null;
    if (wd && !target.closest('[data-wclose]')) {
      const w = wins.find((q) => q.id === wd.dataset.wdrag); if (!w) return;
      const ox = w.x, oy = w.y; let moved = false;
      const mv = (ev: PointerEvent) => { const nx = ox + (ev.clientX - sx) / k, ny = oy + (ev.clientY - sy) / k; if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 3) moved = true; w.x = Math.max(0, Math.min(150, nx)); w.y = Math.max(0, Math.min(100, ny)); const dom = box.querySelector(`[data-win="${w.id}"]`) as HTMLElement | null; if (dom) { dom.style.left = `${w.x}px`; dom.style.top = `${w.y}px`; } };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (moved) { box.dataset.dragged = '1'; setTimeout(() => delete box.dataset.dragged, 60); } };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); return;
    }
    const tk = target.closest('[data-piece],[data-person],[data-token]') as HTMLElement | null;
    if (!tk) return;
    const key = tk.dataset.piece ?? tk.dataset.person ?? tk.dataset.token!;
    let ghost: HTMLElement | null = null;
    const move = (ev: PointerEvent) => {
      if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) { ghost = el('div', 'pc ghost', tk.textContent ?? ''); box.append(ghost); }
      if (ghost) { const r = root().getBoundingClientRect(); ghost.style.left = `${(ev.clientX - r.left) / k}px`; ghost.style.top = `${(ev.clientY - r.top) / k}px`; }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      if (!ghost) return;
      ghost.remove();
      const zone = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('[data-zone]') as HTMLElement | null;
      if (zone) { if (layout === 'logic') { ans.identity = [zone.dataset.zone!]; grabbed = null; render(); } else put(key, zone.dataset.zone!); }
      else if (pieceLayout && zoneOf(key)) put(key, TRAY); // 칸 밖에 놓으면 보관함으로
      box.dataset.dragged = '1'; setTimeout(() => delete box.dataset.dragged, 60);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });
  box.addEventListener('click', (e) => { if (box.dataset.dragged) e.stopImmediatePropagation(); }, true);

  pushModal({
    id: 'puzzle',
    onKey(e) {
      if (rule) { if (e.key === 'Enter' && !e.repeat) { rule = false; setFlag(s, 'puzzle_rule_seen'); render(); } return; }
      if (confirming) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') confirmSel = 1 - confirmSel;
        else if (e.key === 'Enter' && !e.repeat) { if (confirmSel === 0) { submit(); return; } confirming = false; }
        else if (e.key === 'Escape' && !e.repeat) confirming = false;
        render(); return;
      }
      const fwd = e.key === 'ArrowRight' || e.key === 'ArrowDown', back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
      if (ddSlot) { // 열린 드롭다운: ↑↓ 고르기 · Enter 정하기 · Esc 닫기
        const ops = tasks.find((q) => q.slot === ddSlot)!.options;
        if (e.key === 'ArrowDown') ddi = (ddi + 1) % ops.length; else if (e.key === 'ArrowUp') ddi = (ddi + ops.length - 1) % ops.length;
        else if (e.key === 'Enter' && !e.repeat) { pickDd(ddSlot, ops[ddi].id); return; } else if (e.key === 'Escape' && !e.repeat) ddSlot = null;
        render(); return;
      }
      if (grabbed) {
        const zs = layout === 'logic' ? p.table!.rows.map((r) => ({ id: r.id, label: r.cells[0] })) : zoneList();
        const i = Math.max(0, zs.findIndex((z) => z.id === grabZone));
        if (fwd) grabZone = zs[(i + 1) % zs.length].id; else if (back) grabZone = zs[(i + zs.length - 1) % zs.length].id;
        else if (e.key === 'Enter' && !e.repeat) { if (layout === 'logic') { ans.identity = [grabZone!]; grabbed = null; render(); } else put(grabbed, grabZone!); return; }
        else if (e.key === 'Escape' && !e.repeat) { grabbed = null; grabZone = null; }
        const ghostZone = box.querySelector(`[data-zone="${grabZone}"]`); box.querySelectorAll('.zone.pick').forEach((z) => z.classList.remove('pick')); ghostZone?.classList.add('pick');
        if (grabbed) { render(); box.querySelector(`[data-zone="${grabZone}"]`)?.classList.add('pick'); } else render();
        return;
      }
      if (isQuiz && e.key === 'Backspace' && !e.repeat) { goBack(); return; }
      if (isQuiz && e.key === 'Tab' && !e.repeat) { showClues(); return; }
      if (e.key === 'Escape' && !e.repeat) { if (wins.length) { wins.sort((a, b) => b.z - a.z); wins.shift(); render(); } else close(); return; }
      const n = focusList().length;
      if (fwd) fi = (fi + 1) % n; else if (back) fi = (fi + n - 1) % n;
      else if (e.key === 'Enter' && !e.repeat) { activate(); return; }
      render();
    },
  });
  render();
}
