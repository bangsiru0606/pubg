// 퍼즐 화면 (공통 틀 + 배치 4종). 판정은 src/core 의 submitPuzzle 만 쓴다. 화면 구성은 puzzles.json 데이터.
//  plan      P01: 토큰(원장 ①②)을 평면도의 위치 칸에 놓고, 이동된 대상을 표시
//  timeline  P02: 사건 카드를 시간 칸에 놓는다. 타임라인에 안 넣는 카드는 "타임라인 바깥"
//  lightbox  P03: 세 문서를 나란히 보고 의미가 달라진 항목을 표시
//  connect   P04: 문서 카드를 인물 노드에 연결(연결선)
// 마우스: 토큰 드래그 / 클릭 → 위치 클릭. 키보드: ←→ 선택 → Enter 로 잡기 → ←→ 위치 → Enter 로 놓기.
import { characterName, hintFor, isLinkSlot, linkCandidates, linkTitle, puzzleById, shownEvidence, slotLabelOf, submitPuzzle, type GameState, type PuzzleAnswer, type PuzzleLinks, type PuzzleTask } from '../core';
import { el, esc, root } from './hud';
import { bgmPop, bgmPush, puzzleTrack, sfx } from '../audio/audio';
import { popModal, pushModal } from './input';
import { openViewer } from './viewer';

type Focus = { kind: 'token' | 'chip' | 'link' | 'src' | 'submit'; id: string };
const OUTSIDE = 'outside';

export function openPuzzle(s: GameState, puzzleId: string, onClose: (solved: boolean) => void) {
  const p = puzzleById.get(puzzleId)!;
  const layout = p.layout ?? 'plan';
  const tasks = p.tasks ?? [];
  const placeTasks = tasks.filter((t) => t.kind === 'place');
  const markTasks: PuzzleTask[] = tasks.filter((t) => t.kind === 'mark');
  const timeline = layout === 'timeline';

  // ---- 상태: where[토큰] = 위치 칸, marks = 표시한 항목 ----
  const where: Record<string, string | undefined> = {};
  const marks: Record<string, string[]> = Object.fromEntries(markTasks.map((t) => [t.slot, [] as string[]]));
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
    for (const t of markTasks) a[t.slot] = [...marks[t.slot]];
    return a;
  }
  function fromAutoFill(slotId: string, tokens: string[]) {
    if (marks[slotId]) marks[slotId] = [...tokens];
    else if (timeline) { for (const k of Object.keys(where)) if (where[k] === slotId) where[k] = OUTSIDE; where[tokens[0]] = slotId; }
    else where[slotId] = tokens[0];
  }
  if (timeline) for (const k of tokenKeys()) where[k] = OUTSIDE;

  const links: PuzzleLinks = {}; // 슬롯 → 붙인 근거 카드 (단서·진술)
  let pick: { slot: string; cursor: number } | null = null; // 근거 고르기 목록
  let conflicts: string[] = [];
  let note = '';
  let solved = false;
  let hintLevel = 0, removed = new Set<string>(), highlight = new Set<string>();
  let grabbed: string | null = null;
  let grabFrom: string | undefined;
  let fi = 0;

  function applyHint() {
    const h = hintFor(p, s.wrongCountByPuzzle[puzzleId] ?? 0, toAnswer(), links);
    hintLevel = h.level; removed = new Set(h.removedTokens); highlight = new Set(h.highlightEvidenceIds);
    return h;
  }
  const isRemoved = (slot: string, id: string) => removed.has(`${slot}:${id}`) || removed.has(`*:${id}`);
  { const h = applyHint(); if (h.autoFill) { fromAutoFill(h.autoFill.slotId, h.autoFill.tokens); if (h.autoFill.link) links[h.autoFill.slotId] = h.autoFill.link; } }
  /** 그 칸에 답(토큰·표시)이 있는가: 있어야 근거를 붙일 수 있다 */
  const answered = (slot: string) => (timeline ? Object.values(where).includes(slot) : markTasks.some((t) => t.slot === slot) ? marks[slot].length > 0 : !!where[slot]);
  const linkSlots = () => p.slots.filter((sl) => isLinkSlot(p, sl) && answered(sl));

  // ---- 위치 칸 ----
  type Zone = { id: string; label: string; sub?: string; x: number; y: number; w: number; h: number };
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
  const markOptions = (t: PuzzleTask) => t.options.filter((o) => !isRemoved(t.slot, o.id));

  const box = el('div', 'modal puzzle'); box.id = 'puzzle'; box.dataset.pid = puzzleId; // 개발용 플레이 기록이 어느 퍼즐인지 읽는다
  root().append(box); bgmPush('puzzle', puzzleTrack());

  const focusList = (): Focus[] => [
    ...visibleTokens().map((k) => ({ kind: 'token' as const, id: k })),
    ...markTasks.flatMap((t) => markOptions(t).map((o) => ({ kind: 'chip' as const, id: `${t.slot}|${o.id}` }))),
    ...linkSlots().map((sl) => ({ kind: 'link' as const, id: sl })),
    ...p.sourceEvidenceIds.filter((id) => s.evidenceIds.includes(id)).map((id) => ({ kind: 'src' as const, id })),
    { kind: 'submit', id: 'submit' },
  ];
  const isFocus = (kind: Focus['kind'], id: string) => { const f = focusList()[fi]; return !!f && f.kind === kind && f.id === id; };
  const tkHtml = (k: string) => `<span class="tk${grabbed === k ? ' grab' : ''}${isFocus('token', k) ? ' foc' : ''}" data-token="${esc(k)}">${esc(tokenLabel(k))}</span>`;

  /** 근거 칸: 답을 놓은 칸 옆에 붙이는 단추. 붙인 카드의 이름이 보인다. */
  const lnkHtml = (slot: string) => {
    if (!isLinkSlot(p, slot)) return '';
    const on = answered(slot), id = links[slot];
    return `<button class="lnk${id ? ' has' : ''}${!on ? ' off' : ''}${isFocus('link', slot) ? ' foc' : ''}" data-link="${esc(slot)}"${on ? '' : ' disabled'}>${id ? `근거: ${esc(linkTitle(s, id))}` : on ? '[근거 붙이기]' : '근거: (먼저 이 칸을 채운다)'}</button>`;
  };

  // ---- 그리기 ----
  function mainHtml(): string {
    const here = (z: string) => visibleTokens().filter((k) => (where[k] ?? (timeline ? OUTSIDE : undefined)) === z);
    if (layout === 'logic') {
      const cols = p.table!.columns.map((c) => `<th>${esc(c)}</th>`).join('');
      const rows = p.table!.rows.filter((row) => !isRemoved('identity', row.id)).map((row) => {
        const toks = here(row.id).map(tkHtml).join('');
        return `<tr class="zone" data-zone="${row.id}"><td>${esc(row.cells[0])} ${toks}</td>${row.cells.slice(1).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`;
      }).join('');
      return `<table class="ltab"><tr>${cols}</tr>${rows}</table>`;
    }
    if (layout === 'lightbox') {
      return `<div class="panels">${(p.panels ?? []).map((pn) => { const lines = pn.evidenceId ? (shownEvidence(s, pn.evidenceId)?.body ?? []) : (pn.lines ?? []); return `<div class="panel"><div class="ph-t">${esc(pn.title)}</div>${lines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>`; }).join('')}</div>`;
    }
    if (layout === 'connect') {
      const zs = allZones();
      const rows = placeTasks.map((t, i) => {
        const y = 4 + i * 24;
        return `<div class="crow" style="top:${y}%"><span class="tk${grabbed === t.slot ? ' grab' : ''}${isFocus('token', t.slot) ? ' foc' : ''}" data-token="${esc(t.slot)}">${esc(t.token ?? t.label)}</span>${lnkHtml(t.slot)}</div>`;
      }).join('');
      const nodes = zs.map((z) => `<div class="zone node" data-zone="${z.id}" style="left:${z.x}%;top:${z.y}%;width:${z.w}%;height:${z.h}%"><span class="zl">${esc(z.label)}</span>${z.sub ? `<span class="zs">${esc(z.sub)}</span>` : ''}</div>`).join('');
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
      ? placeTasks.map((t, i) => `<div class="trow">${'①②③'[i]} ${esc(t.label)}: <b>${where[t.slot] ? esc(allZones().find((z) => z.id === where[t.slot])?.label ?? '') : '<span class="slotlbl">(배치 안 됨)</span>'}</b> ${lnkHtml(t.slot)}</div>`).join('')
      : '';
    const tray = layout === 'plan' || layout === 'logic' ? `<div class="tray"><span class="slotlbl">토큰:</span> ${placeTasks.filter((t) => !where[t.slot]).map((t) => tkHtml(t.slot)).join('') || '<span class="slotlbl">모두 배치했다</span>'}${layout === 'logic' ? ` · ④ P-271 신원 ${lnkHtml('identity')}` : ''}</div>` : '';
    const chips = markTasks.map((t) => `<div class="trow">${layout === 'plan' ? '③ ' : ''}${esc(t.label)}: ${markOptions(t).map((o) => {
      const key = `${t.slot}|${o.id}`, on = marks[t.slot].includes(o.id);
      return `<button class="chip${on ? ' on' : ''}${isFocus('chip', key) ? ' foc' : ''}" data-chip="${esc(key)}">${on ? '☑' : '☐'} ${esc(o.label)}</button>`;
    }).join('')} ${lnkHtml(t.slot)}</div>`).join('');
    // 타임라인(시간 칸마다)·논리표(신원 토큰)는 과제 줄이 따로 없어서 근거 줄을 만든다
    const extraLinks = timeline ? `<div class="trow">${p.boxes!.map((b) => `${esc(b.label)} ${lnkHtml(b.id)}`).join(' ')}</div>`
      : '';
    const srcs = p.sourceEvidenceIds.filter((id) => s.evidenceIds.includes(id)).map((id) =>
      `<button class="src${highlight.has(id) ? ' hl' : ''}${isFocus('src', id) ? ' foc' : ''}" data-src="${id}">${esc(shownEvidence(s, id)!.title)}</button>`).join('');
    const hintTxt = hintLevel ? `<div class="hint-t">힌트 ${hintLevel}단계: ${esc(p.hintTexts[hintLevel - 1])}</div>` : '';
    const fb = solved ? '<div class="ok">맞춰졌다. (Enter: 닫기)</div>'
      : `${conflicts.length ? `<div class="warn">${conflicts.map((c) => `· ${esc(c)}`).join('<br>')}</div>` : ''}${note ? `<div class="note">${esc(note)}</div>` : ''}${hintTxt}`;
    const info = (p.info ?? []).length ? `<div class="slotlbl">제공 정보</div><ul>${p.info!.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '';
    const quotes = (p.statements ?? []).map((id) => { const st = s.statements[id]; return st ? `<div class="quote">${esc(characterName(st.speaker))}의 진술: “${esc(st.text)}”</div>` : ''; }).join('');
    const side = `${info}${quotes}${srcs ? '<div class="slotlbl">원문 자료 다시 열기</div>' + srcs : ''}${fb}`;
    box.className = `modal puzzle lay-${layout}`;
    box.innerHTML = `<div class="ptitle">${esc(p.title ?? '')}${p.subtitle ? ` <span class="psub">${esc(p.subtitle)}</span>` : ''}</div>
      <div class="pleft">${mainHtml()}${tray}</div>
      <div class="pright">${side}</div>
      <div class="ptasks">${taskRows}${chips}${extraLinks}<button class="submit${isFocus('submit', 'submit') ? ' foc' : ''}" data-submit>[확인]</button></div>
      ${pickHtml()}
      <div class="foot">${pick ? '↑↓ 자료 선택 · Enter 붙이기 · Esc 닫기' : grabbed ? '←→ 위치 선택 · Enter 놓기 · Esc 취소' : '←→ 선택 · Enter 잡기/표시/근거/열기/확인 · Esc 나가기 · 마우스: 드래그'}</div>`;
    const sel = box.querySelector('.lrow.sel') as HTMLElement | null, list = box.querySelector('.lplist') as HTMLElement | null; // 선택한 자료가 항상 보이게 목록을 맞춘다
    if (list && sel) { const top = sel.offsetTop, bottom = top + sel.offsetHeight; if (top < list.scrollTop) list.scrollTop = top; else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight; }
  }
  /** 근거 고르기: 가진 단서·진술 카드를 전부 보여 준다 (정답만 추리지 않는다) */
  function pickHtml(): string {
    if (!pick) return '';
    const cands = linkCandidates(s);
    const rows = [`<button class="lrow${pick.cursor === 0 ? ' sel' : ''}" data-pk="0"><span class="lt">(붙인 자료 떼기)</span></button>`,
      ...cands.map((c, i) => `<button class="lrow${pick!.cursor === i + 1 ? ' sel' : ''}${links[pick!.slot] === c.id ? ' cur' : ''}" data-pk="${i + 1}"><span class="tag t-${c.kind === 'statement' ? 'testimony' : (shownEvidence(s, c.id)?.sourceType ?? 'record')}">${c.kind === 'statement' ? '진술' : '단서'}</span><span class="lt">${esc(c.title)}</span><span class="ld">${esc(c.detail)}</span></button>`)].join('');
    return `<div class="lpick"><div class="lph">근거 자료 — ${esc(slotLabelOf(p, pick.slot))}</div><div class="lplist">${rows}</div></div>`;
  }
  function choosePick(i: number) {
    if (!pick) return;
    const cands = linkCandidates(s);
    if (i === 0) delete links[pick.slot]; else if (cands[i - 1]) links[pick.slot] = cands[i - 1].id;
    pick = null; note = ''; render();
  }
  function openPick(slot: string) { if (!answered(slot)) return; const cands = linkCandidates(s), cur = cands.findIndex((c) => c.id === links[slot]); pick = { slot, cursor: cur >= 0 ? cur + 1 : 1 }; render(); }

  // ---- 동작 ----
  function place(key: string, zoneId: string) {
    if (timeline && zoneId !== OUTSIDE) for (const k of Object.keys(where)) if (k !== key && where[k] === zoneId) where[k] = OUTSIDE; // 한 칸에 카드 하나: 기존 카드는 바깥으로
    where[key] = zoneId; grabbed = null; grabFrom = undefined; note = ''; render();
  }
  function toggleChip(key: string) { const [slot, id] = key.split('|'); const a = marks[slot]; const i = a.indexOf(id); if (i >= 0) a.splice(i, 1); else a.push(id); render(); }
  function submit() {
    const r = submitPuzzle(s, puzzleId, toAnswer(), { ...links });
    if (r.status === 'incomplete') { note = '모든 과제를 채운 뒤에 확인할 수 있다.'; conflicts = []; }
    else if (r.status === 'wrong') {
      conflicts = r.conflicts; note = r.conflicts.length ? '' : '아직 맞지 않는다. 자료를 다시 비교해 보자.';
      sfx('onPuzzleWrong'); // 확인 버튼을 누른 뒤에만 결과음
      const prev = hintLevel, h = applyHint();
      if (h.level > prev) window.setTimeout(() => sfx('onHint'), 450);
      if (h.autoFill) { fromAutoFill(h.autoFill.slotId, h.autoFill.tokens); if (h.autoFill.link) links[h.autoFill.slotId] = h.autoFill.link; }
    } else { solved = true; conflicts = []; note = ''; sfx('onPuzzleCorrect'); }
    render();
  }
  const close = () => { bgmPop('puzzle'); popModal('puzzle'); box.remove(); onClose(solved); };

  function startGrab(key: string) {
    grabbed = key; grabFrom = where[key];
    if (!where[key]) where[key] = (timeline ? OUTSIDE : zonesFor(key)[0].id);
    render();
  }
  function activate() {
    const f = focusList()[fi]; if (!f) return;
    if (f.kind === 'token') startGrab(f.id);
    else if (f.kind === 'chip') toggleChip(f.id);
    else if (f.kind === 'link') openPick(f.id);
    else if (f.kind === 'src') openViewer(s, f.id);
    else submit();
  }

  box.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (solved) { close(); return; }
    const z = t.closest('[data-zone]') as HTMLElement | null;
    if (grabbed && z) { place(grabbed, z.dataset.zone!); return; }
    const pk = t.closest('[data-pk]') as HTMLElement | null;
    if (pick) { if (pk) choosePick(+pk.dataset.pk!); else if (!t.closest('.lpick')) { pick = null; render(); } return; }
    const lk = t.closest('[data-link]') as HTMLElement | null;
    if (lk) { fi = focusList().findIndex((f) => f.kind === 'link' && f.id === lk.dataset.link); openPick(lk.dataset.link!); return; }
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
      if (pick) { // 근거 고르기
        const n = linkCandidates(s).length + 1;
        if (e.key === 'ArrowDown') pick.cursor = (pick.cursor + 1) % n;
        else if (e.key === 'ArrowUp') pick.cursor = (pick.cursor + n - 1) % n;
        else if (e.key === 'Enter' && !e.repeat) { choosePick(pick.cursor); return; }
        else if (e.key === 'Escape' && !e.repeat) pick = null;
        render(); return;
      }
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
