// 퍼즐 화면 (공통 틀 + 배치형 SpatialPlacement). 판정은 src/core 의 submitPuzzle 만 쓴다.
// 마우스: 토큰을 평면도 위로 드래그(또는 토큰 클릭 → 위치 클릭). 키보드: ←→ 토큰 선택 → Enter 로 잡기 → ←→ 위치 → Enter 로 놓기.
import { evidenceById, hintFor, puzzleById, submitPuzzle, type GameState, type PuzzleAnswer } from '../core';
import { el, esc, root } from './hud';
import { popModal, pushModal } from './input';
import { openViewer } from './viewer';

type Focus = { kind: 'token' | 'chip' | 'src' | 'submit'; id: string };

export function openPuzzle(s: GameState, puzzleId: string, onClose: (solved: boolean) => void) {
  const p = puzzleById.get(puzzleId)!;
  const tasks = p.tasks ?? [];
  const placeTasks = tasks.filter((t) => t.kind === 'place');
  const markTask = tasks.find((t) => t.kind === 'mark')!;
  const ans: PuzzleAnswer = {};
  for (const t of tasks) ans[t.slot] = [];
  const labelOf = (slot: string, id: string) => tasks.find((t) => t.slot === slot)!.options.find((o) => o.id === id)!.label;

  let conflicts: string[] = [];
  let note = '';
  let solved = false;
  let hintLevel = 0, removed = new Set<string>(), highlight = new Set<string>();
  let grabbed: string | null = null;         // 잡고 있는 토큰의 slot
  let grabFrom: string[] | null = null;      // 취소용
  let fi = 0;

  function applyHint() {
    const wrong = s.wrongCountByPuzzle[puzzleId] ?? 0;
    const h = hintFor(p, wrong, ans);
    hintLevel = h.level; removed = new Set(h.removedTokens); highlight = new Set(h.highlightEvidenceIds);
    return h;
  }
  const isRemoved = (slot: string, id: string) => removed.has(`${slot}:${id}`) || removed.has(`*:${id}`);
  const zonesFor = (slot: string) => (p.zones ?? []).filter((z) => !isRemoved(slot, z.id));

  // 재진입 시 3단계 힌트가 이미 열려 있으면 한 칸을 채운 상태로 시작
  { const h = applyHint(); if (h.autoFill) ans[h.autoFill.slotId] = [...h.autoFill.tokens]; }

  const box = el('div', 'modal puzzle'); box.id = 'puzzle';
  root().append(box);

  const focusList = (): Focus[] => [
    ...placeTasks.map((t) => ({ kind: 'token' as const, id: t.slot })),
    ...markTask.options.filter((o) => !isRemoved(markTask.slot, o.id)).map((o) => ({ kind: 'chip' as const, id: o.id })),
    ...p.sourceEvidenceIds.filter((id) => s.evidenceIds.includes(id)).map((id) => ({ kind: 'src' as const, id })),
    { kind: 'submit', id: 'submit' },
  ];
  const isFocus = (kind: Focus['kind'], id: string) => { const f = focusList()[fi]; return !!f && f.kind === kind && f.id === id; };

  function tokenHtml(t: (typeof placeTasks)[number], inZone: boolean) {
    const cls = `tk${grabbed === t.slot ? ' grab' : ''}${isFocus('token', t.slot) ? ' foc' : ''}`;
    return `<span class="${cls}" data-token="${t.slot}" ${inZone ? '' : 'title=""'}>${esc(t.token ?? t.label)}</span>`;
  }

  function render() {
    const planZones = zonesFor(placeTasks[0].slot).map((z) => {
      const here = placeTasks.filter((t) => ans[t.slot][0] === z.id);
      return `<div class="zone" data-zone="${z.id}" style="left:${z.x}%;top:${z.y}%;width:${z.w}%;height:${z.h}%"><span class="zl">${esc(z.label)}</span>${here.map((t) => tokenHtml(t, true)).join('')}</div>`;
    }).join('');
    const fixtures = (p.fixtures ?? []).map((f) => `<div class="fix fx-${f.id}" style="left:${f.x}%;top:${f.y}%;width:${f.w}%;height:${f.h}%"><span>${esc(f.label)}</span></div>`).join('');
    const tray = placeTasks.filter((t) => !ans[t.slot].length).map((t) => tokenHtml(t, false)).join('') || '<span class="slotlbl">모든 토큰을 배치했다</span>';
    const taskRows = placeTasks.map((t, i) => `<div class="trow">${'①②③'[i]} ${esc(t.label)}: <b>${ans[t.slot][0] ? esc(labelOf(t.slot, ans[t.slot][0])) : '<span class="slotlbl">(배치 안 됨)</span>'}</b></div>`).join('');
    const chips = markTask.options.filter((o) => !isRemoved(markTask.slot, o.id)).map((o) =>
      `<button class="chip${ans[markTask.slot].includes(o.id) ? ' on' : ''}${isFocus('chip', o.id) ? ' foc' : ''}" data-chip="${o.id}">${ans[markTask.slot].includes(o.id) ? '☑' : '☐'} ${esc(o.label)}</button>`).join('');
    const srcs = p.sourceEvidenceIds.filter((id) => s.evidenceIds.includes(id)).map((id) =>
      `<button class="src${highlight.has(id) ? ' hl' : ''}${isFocus('src', id) ? ' foc' : ''}" data-src="${id}">${esc(evidenceById.get(id)!.title)}</button>`).join('');
    const hintTxt = hintLevel ? `<div class="hint-t">힌트 ${hintLevel}단계: ${esc(p.hintTexts[hintLevel - 1])}</div>` : '';
    const body = solved
      ? '<div class="ok">원장실 평면도가 맞춰졌다. (Enter: 닫기)</div>'
      : `${conflicts.length ? `<div class="warn">${conflicts.map((c) => `· ${esc(c)}`).join('<br>')}</div>` : ''}${note ? `<div class="note">${esc(note)}</div>` : ''}${hintTxt}`;
    box.innerHTML = `<div class="ptitle">${esc(p.title ?? '')}</div>
      <div class="pleft"><div class="plan">${fixtures}${planZones}</div><div class="tray"><span class="slotlbl">토큰:</span> ${tray}</div></div>
      <div class="pright"><div class="slotlbl">제공 정보</div><ul>${(p.info ?? []).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
        <div class="slotlbl">원문 자료 다시 열기</div>${srcs}${body}</div>
      <div class="ptasks">${taskRows}<div class="trow">③ ${esc(markTask.label)}: ${chips}</div>
        <button class="submit${isFocus('submit', 'submit') ? ' foc' : ''}" data-submit>[확인]</button></div>
      <div class="foot">${grabbed ? '←→ 위치 선택 · Enter 놓기 · Esc 취소' : '←→ 선택 · Enter 잡기/표시/열기/확인 · Esc 나가기 · 마우스: 드래그'}</div>`;
  }

  // ---- 동작 ----
  function place(slot: string, zoneId: string) { ans[slot] = [zoneId]; grabbed = null; grabFrom = null; note = ''; render(); }
  function toggleChip(id: string) {
    const a = ans[markTask.slot]; const i = a.indexOf(id);
    if (i >= 0) a.splice(i, 1); else a.push(id);
    render();
  }
  function submit() {
    const r = submitPuzzle(s, puzzleId, ans);
    if (r.status === 'incomplete') { note = '모든 과제를 채운 뒤에 확인할 수 있다.'; conflicts = []; }
    else if (r.status === 'wrong') {
      conflicts = r.conflicts; note = '';
      const h = applyHint();
      if (h.autoFill) ans[h.autoFill.slotId] = [...h.autoFill.tokens];
    } else { solved = true; conflicts = []; note = ''; }
    render();
  }
  const close = () => { popModal('puzzle'); box.remove(); onClose(solved); };

  function activate() {
    const f = focusList()[fi]; if (!f) return;
    if (f.kind === 'token') {
      grabbed = f.id; grabFrom = [...ans[f.id]];
      if (!ans[f.id].length) ans[f.id] = [zonesFor(f.id)[0].id];
      render();
    } else if (f.kind === 'chip') toggleChip(f.id);
    else if (f.kind === 'src') openViewer(s, f.id);
    else submit();
  }

  box.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (solved) { close(); return; }
    const z = t.closest('[data-zone]') as HTMLElement | null;
    if (grabbed && z) { place(grabbed, z.dataset.zone!); return; }
    const chip = t.closest('[data-chip]') as HTMLElement | null;
    const src = t.closest('[data-src]') as HTMLElement | null;
    if (chip) { fi = focusList().findIndex((f) => f.kind === 'chip' && f.id === chip.dataset.chip); toggleChip(chip.dataset.chip!); }
    else if (src) { fi = focusList().findIndex((f) => f.kind === 'src' && f.id === src.dataset.src); openViewer(s, src.dataset.src!); }
    else if (t.closest('[data-submit]')) { fi = focusList().length - 1; submit(); }
    else if (t.closest('[data-token]')) { const slot = (t.closest('[data-token]') as HTMLElement).dataset.token!; fi = focusList().findIndex((f) => f.kind === 'token' && f.id === slot); grabbed = grabbed === slot ? null : slot; grabFrom = [...ans[slot]]; render(); }
  });

  // 드래그: 토큰 → 평면도의 위치 칸
  box.addEventListener('pointerdown', (e) => {
    const tk = (e.target as HTMLElement).closest('[data-token]') as HTMLElement | null;
    if (!tk || solved) return;
    const slot = tk.dataset.token!;
    const k = root().getBoundingClientRect().width / 480;
    const sx = e.clientX, sy = e.clientY;
    let ghost: HTMLElement | null = null;
    const move = (ev: PointerEvent) => {
      if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) {
        ghost = el('div', 'tk ghost', tk.textContent ?? ''); box.append(ghost);
      }
      if (ghost) { const r = root().getBoundingClientRect(); ghost.style.left = `${(ev.clientX - r.left) / k}px`; ghost.style.top = `${(ev.clientY - r.top) / k}px`; }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      if (!ghost) return; // 클릭은 click 핸들러가 처리
      ghost.remove();
      const zone = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('[data-zone]') as HTMLElement | null;
      if (zone) place(slot, zone.dataset.zone!);
      box.dataset.dragged = '1'; setTimeout(() => delete box.dataset.dragged, 60);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });
  // 드래그 직후 발생하는 click 은 무시
  box.addEventListener('click', (e) => { if (box.dataset.dragged) e.stopImmediatePropagation(); }, true);

  pushModal({
    id: 'puzzle',
    onKey(e) {
      if (solved) { if ((e.key === 'Enter' || e.key === 'Escape') && !e.repeat) close(); return; }
      const fwd = e.key === 'ArrowRight' || e.key === 'ArrowDown', back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
      if (grabbed) {
        const zs = zonesFor(grabbed);
        const i = zs.findIndex((z) => z.id === ans[grabbed!][0]);
        if (fwd) ans[grabbed] = [zs[(i + 1) % zs.length].id];
        else if (back) ans[grabbed] = [zs[(i + zs.length - 1) % zs.length].id];
        else if (e.key === 'Enter' && !e.repeat) { place(grabbed, ans[grabbed][0]); return; }
        else if (e.key === 'Escape' && !e.repeat) { ans[grabbed] = grabFrom ?? []; grabbed = null; grabFrom = null; }
        render(); return;
      }
      const n = focusList().length;
      if (fwd) fi = (fi + 1) % n; else if (back) fi = (fi + n - 1) % n;
      else if (e.key === 'Enter' && !e.repeat) { activate(); return; }
      else if (e.key === 'Escape' && !e.repeat) { close(); return; }
      render();
    },
  });
  render();
}
