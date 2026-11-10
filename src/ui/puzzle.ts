// 퍼즐 화면 (공통 틀 + 배치 4종). 판정은 src/core 의 submitPuzzle 만 쓴다. 화면 구성은 puzzles.json 데이터.
//  plan      P01: 토큰(원장 ①②)을 평면도의 위치 칸에 놓고, 이동된 대상을 표시
//  timeline  P02: 사건 카드를 시간 칸에 놓는다. 타임라인에 안 넣는 카드는 "타임라인 바깥"
//  lightbox  P03: 세 문서를 나란히 보고 의미가 달라진 항목을 표시
//  connect   P04: 문서 카드를 인물 노드에 연결(연결선)
// 마우스: 토큰 드래그 / 클릭 → 위치 클릭. 키보드: ←→ 선택 → Enter 로 잡기 → ←→ 위치 → Enter 로 놓기.
import { hintFor, puzzleById, shownEvidence, submitPuzzle, type GameState, type PuzzleAnswer, type PuzzleTask } from '../core';
import { el, esc, root } from './hud';
import { popModal, pushModal } from './input';
import { openViewer } from './viewer';

type Focus = { kind: 'token' | 'chip' | 'src' | 'submit'; id: string };
const OUTSIDE = 'outside';

export function openPuzzle(s: GameState, puzzleId: string, onClose: (solved: boolean) => void) {
  const p = puzzleById.get(puzzleId)!;
  const layout = p.layout ?? 'plan';
  const tasks = p.tasks ?? [];
  const placeTasks = tasks.filter((t) => t.kind === 'place');
  const markTask: PuzzleTask | undefined = tasks.find((t) => t.kind === 'mark');
  const timeline = layout === 'timeline';

  // ---- 상태: where[토큰] = 위치 칸, marks = 표시한 항목 ----
  const where: Record<string, string | undefined> = {};
  let marks: string[] = [];
  const tokenKeys = (): string[] => (timeline ? (p.tokens ?? []).map((t) => t.id) : placeTasks.map((t) => t.slot));
  const tokenLabel = (k: string) => {
    if (timeline) return p.tokens!.find((t) => t.id === k)!.label;
    const t = placeTasks.find((q) => q.slot === k)!;
    return t.token ?? t.label;
  };

  function toAnswer(): PuzzleAnswer {
    const a: PuzzleAnswer = {};
    for (const slot of p.slots) a[slot] = [];
    if (timeline) { for (const [k, z] of Object.entries(where)) if (z && z !== OUTSIDE) a[z] = [k]; }
    else for (const t of placeTasks) if (where[t.slot]) a[t.slot] = [where[t.slot]!];
    if (markTask) a[markTask.slot] = [...marks];
    return a;
  }
  function fromAutoFill(slotId: string, tokens: string[]) {
    if (markTask && slotId === markTask.slot) marks = [...tokens];
    else if (timeline) { for (const k of Object.keys(where)) if (where[k] === slotId) where[k] = OUTSIDE; where[tokens[0]] = slotId; }
    else where[slotId] = tokens[0];
  }
  if (timeline) for (const k of tokenKeys()) where[k] = OUTSIDE;

  let conflicts: string[] = [];
  let note = '';
  let solved = false;
  let hintLevel = 0, removed = new Set<string>(), highlight = new Set<string>();
  let grabbed: string | null = null;
  let grabFrom: string | undefined;
  let fi = 0;

  function applyHint() {
    const h = hintFor(p, s.wrongCountByPuzzle[puzzleId] ?? 0, toAnswer());
    hintLevel = h.level; removed = new Set(h.removedTokens); highlight = new Set(h.highlightEvidenceIds);
    return h;
  }
  const isRemoved = (slot: string, id: string) => removed.has(`${slot}:${id}`) || removed.has(`*:${id}`);
  { const h = applyHint(); if (h.autoFill) fromAutoFill(h.autoFill.slotId, h.autoFill.tokens); }

  // ---- 위치 칸 ----
  type Zone = { id: string; label: string; x: number; y: number; w: number; h: number };
  const zonesFor = (key: string): Zone[] => {
    if (timeline) {
      const n = p.boxes!.length;
      return [...p.boxes!.map((b, i) => ({ id: b.id, label: b.label, x: 1 + i * (98 / n), y: 3, w: 98 / n - 2, h: 38 })),
        { id: OUTSIDE, label: '타임라인 바깥', x: 1, y: 50, w: 98, h: 46 }];
    }
    return (p.zones ?? []).filter((z) => !isRemoved(key, z.id));
  };
  const allZones = () => zonesFor(tokenKeys()[0]);
  const visibleTokens = () => tokenKeys().filter((k) => !(timeline && isRemoved('', k)));
  const markOptions = () => (markTask?.options ?? []).filter((o) => !isRemoved(markTask!.slot, o.id));

  const box = el('div', 'modal puzzle'); box.id = 'puzzle';
  root().append(box);

  const focusList = (): Focus[] => [
    ...visibleTokens().map((k) => ({ kind: 'token' as const, id: k })),
    ...markOptions().map((o) => ({ kind: 'chip' as const, id: o.id })),
    ...p.sourceEvidenceIds.filter((id) => s.evidenceIds.includes(id)).map((id) => ({ kind: 'src' as const, id })),
    { kind: 'submit', id: 'submit' },
  ];
  const isFocus = (kind: Focus['kind'], id: string) => { const f = focusList()[fi]; return !!f && f.kind === kind && f.id === id; };
  const tkHtml = (k: string) => `<span class="tk${grabbed === k ? ' grab' : ''}${isFocus('token', k) ? ' foc' : ''}" data-token="${esc(k)}">${esc(tokenLabel(k))}</span>`;

  // ---- 그리기 ----
  function mainHtml(): string {
    const here = (z: string) => visibleTokens().filter((k) => (where[k] ?? (timeline ? OUTSIDE : undefined)) === z);
    if (layout === 'lightbox') {
      return `<div class="panels">${(p.panels ?? []).map((pn) => `<div class="panel"><div class="ph-t">${esc(pn.title)}</div>${pn.lines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>`).join('')}</div>`;
    }
    if (layout === 'connect') {
      const zs = allZones();
      const rows = placeTasks.map((t, i) => {
        const y = 4 + i * 24;
        return `<div class="crow" style="top:${y}%"><span class="tk${grabbed === t.slot ? ' grab' : ''}${isFocus('token', t.slot) ? ' foc' : ''}" data-token="${esc(t.slot)}">${esc(t.token ?? t.label)}</span><span class="cdet">${esc(t.detail ?? '')}</span></div>`;
      }).join('');
      const nodes = zs.map((z) => `<div class="zone node" data-zone="${z.id}" style="left:${z.x}%;top:${z.y}%;width:${z.w}%;height:${z.h}%"><span class="zl">${esc(z.label)}</span></div>`).join('');
      const lines = placeTasks.map((t, i) => {
        const z = zs.find((q) => q.id === where[t.slot]); if (!z) return '';
        return `<line x1="58" y1="${4 + i * 24 + 6}" x2="${z.x}" y2="${z.y + z.h / 2}" />`;
      }).join('');
      return `<div class="plan"><svg class="lines" viewBox="0 0 100 100" preserveAspectRatio="none">${lines}</svg>${rows}${nodes}</div>`;
    }
    const zs = allZones();
    const zoneHtml = zs.map((z) => {
      const toks = here(z.id).map(tkHtml).join('');
      return `<div class="zone${z.id === OUTSIDE ? ' outside' : ''}" data-zone="${z.id}" style="left:${z.x}%;top:${z.y}%;width:${z.w}%;height:${z.h}%"><span class="zl">${esc(z.label)}</span>${toks}</div>`;
    }).join('');
    const fixtures = (p.fixtures ?? []).map((f) => `<div class="fix fx-${f.id}" style="left:${f.x}%;top:${f.y}%;width:${f.w}%;height:${f.h}%"><span>${esc(f.label)}</span></div>`).join('');
    return `<div class="plan">${fixtures}${zoneHtml}</div>`;
  }

  function render() {
    const taskRows = layout === 'plan'
      ? placeTasks.map((t, i) => `<div class="trow">${'①②③'[i]} ${esc(t.label)}: <b>${where[t.slot] ? esc(allZones().find((z) => z.id === where[t.slot])?.label ?? '') : '<span class="slotlbl">(배치 안 됨)</span>'}</b></div>`).join('')
      : '';
    const tray = layout === 'plan' ? `<div class="tray"><span class="slotlbl">토큰:</span> ${placeTasks.filter((t) => !where[t.slot]).map((t) => tkHtml(t.slot)).join('') || '<span class="slotlbl">모두 배치했다</span>'}</div>` : '';
    const chips = markTask ? `<div class="trow">${layout === 'plan' ? '③ ' : ''}${esc(markTask.label)}: ${markOptions().map((o) =>
      `<button class="chip${marks.includes(o.id) ? ' on' : ''}${isFocus('chip', o.id) ? ' foc' : ''}" data-chip="${o.id}">${marks.includes(o.id) ? '☑' : '☐'} ${esc(o.label)}</button>`).join('')}</div>` : '';
    const srcs = p.sourceEvidenceIds.filter((id) => s.evidenceIds.includes(id)).map((id) =>
      `<button class="src${highlight.has(id) ? ' hl' : ''}${isFocus('src', id) ? ' foc' : ''}" data-src="${id}">${esc(shownEvidence(s, id)!.title)}</button>`).join('');
    const hintTxt = hintLevel ? `<div class="hint-t">힌트 ${hintLevel}단계: ${esc(p.hintTexts[hintLevel - 1])}</div>` : '';
    const fb = solved ? '<div class="ok">맞춰졌다. (Enter: 닫기)</div>'
      : `${conflicts.length ? `<div class="warn">${conflicts.map((c) => `· ${esc(c)}`).join('<br>')}</div>` : ''}${note ? `<div class="note">${esc(note)}</div>` : ''}${hintTxt}`;
    const side = `<div class="slotlbl">제공 정보</div><ul>${(p.info ?? []).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
      <div class="slotlbl">원문 자료 다시 열기</div>${srcs}${fb}`;
    box.className = `modal puzzle lay-${layout}`;
    box.innerHTML = `<div class="ptitle">${esc(p.title ?? '')}</div>
      <div class="pleft">${mainHtml()}${tray}</div>
      <div class="pright">${side}</div>
      <div class="ptasks">${taskRows}${chips}<button class="submit${isFocus('submit', 'submit') ? ' foc' : ''}" data-submit>[확인]</button></div>
      <div class="foot">${grabbed ? '←→ 위치 선택 · Enter 놓기 · Esc 취소' : '←→ 선택 · Enter 잡기/표시/열기/확인 · Esc 나가기 · 마우스: 드래그'}</div>`;
  }

  // ---- 동작 ----
  function place(key: string, zoneId: string) {
    if (timeline && zoneId !== OUTSIDE) for (const k of Object.keys(where)) if (k !== key && where[k] === zoneId) where[k] = OUTSIDE; // 한 칸에 카드 하나: 기존 카드는 바깥으로
    where[key] = zoneId; grabbed = null; grabFrom = undefined; note = ''; render();
  }
  function toggleChip(id: string) { const i = marks.indexOf(id); if (i >= 0) marks.splice(i, 1); else marks.push(id); render(); }
  function submit() {
    const r = submitPuzzle(s, puzzleId, toAnswer());
    if (r.status === 'incomplete') { note = '모든 과제를 채운 뒤에 확인할 수 있다.'; conflicts = []; }
    else if (r.status === 'wrong') {
      conflicts = r.conflicts; note = r.conflicts.length ? '' : '아직 맞지 않는다. 자료를 다시 비교해 보자.';
      const h = applyHint();
      if (h.autoFill) fromAutoFill(h.autoFill.slotId, h.autoFill.tokens);
    } else { solved = true; conflicts = []; note = ''; }
    render();
  }
  const close = () => { popModal('puzzle'); box.remove(); onClose(solved); };

  function startGrab(key: string) {
    grabbed = key; grabFrom = where[key];
    if (!where[key]) where[key] = (timeline ? OUTSIDE : zonesFor(key)[0].id);
    render();
  }
  function activate() {
    const f = focusList()[fi]; if (!f) return;
    if (f.kind === 'token') startGrab(f.id);
    else if (f.kind === 'chip') toggleChip(f.id);
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
    const tok = t.closest('[data-token]') as HTMLElement | null;
    if (chip) { fi = focusList().findIndex((f) => f.kind === 'chip' && f.id === chip.dataset.chip); toggleChip(chip.dataset.chip!); }
    else if (src) { fi = focusList().findIndex((f) => f.kind === 'src' && f.id === src.dataset.src); openViewer(s, src.dataset.src!); }
    else if (t.closest('[data-submit]')) { fi = focusList().length - 1; submit(); }
    else if (tok) { const k = tok.dataset.token!; fi = focusList().findIndex((f) => f.kind === 'token' && f.id === k); grabbed = grabbed === k ? null : k; grabFrom = where[k]; render(); }
  });

  // 드래그: 토큰 → 위치 칸
  box.addEventListener('pointerdown', (e) => {
    const tk = (e.target as HTMLElement).closest('[data-token]') as HTMLElement | null;
    if (!tk || solved) return;
    const key = tk.dataset.token!;
    const k = root().getBoundingClientRect().width / 480;
    const sx = e.clientX, sy = e.clientY;
    let ghost: HTMLElement | null = null;
    const move = (ev: PointerEvent) => {
      if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) { ghost = el('div', 'tk ghost', tk.textContent ?? ''); box.append(ghost); }
      if (ghost) { const r = root().getBoundingClientRect(); ghost.style.left = `${(ev.clientX - r.left) / k}px`; ghost.style.top = `${(ev.clientY - r.top) / k}px`; }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      if (!ghost) return;
      ghost.remove();
      const zone = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('[data-zone]') as HTMLElement | null;
      if (zone) place(key, zone.dataset.zone!);
      box.dataset.dragged = '1'; setTimeout(() => delete box.dataset.dragged, 60);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });
  box.addEventListener('click', (e) => { if (box.dataset.dragged) e.stopImmediatePropagation(); }, true);

  pushModal({
    id: 'puzzle',
    onKey(e) {
      if (solved) { if ((e.key === 'Enter' || e.key === 'Escape') && !e.repeat) close(); return; }
      const fwd = e.key === 'ArrowRight' || e.key === 'ArrowDown', back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
      if (grabbed) {
        const zs = zonesFor(grabbed);
        const i = Math.max(0, zs.findIndex((z) => z.id === where[grabbed!]));
        if (fwd) where[grabbed] = zs[(i + 1) % zs.length].id;
        else if (back) where[grabbed] = zs[(i + zs.length - 1) % zs.length].id;
        else if (e.key === 'Enter' && !e.repeat) { place(grabbed, where[grabbed]!); return; }
        else if (e.key === 'Escape' && !e.repeat) { where[grabbed] = grabFrom; grabbed = null; grabFrom = undefined; }
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
