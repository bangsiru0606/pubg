// 씬 7 최종 보고서: 수사 보고서 종이 한 장에 질문 하나(A~D). 위쪽 탭으로 쪽을 넘기고, 마지막 쪽에서 보고 대상을 고르고 전체 미리보기를 읽은 뒤 제출한다.
//  - 가설은 문장 빈칸으로 고른다. 근거(2칸)와 예상 반론(1칸)은 왼쪽 단서 서랍의 카드를 끌어다 꽂는다 (클릭·키보드로도 된다).
//  - 미검증·검증 실패·맥락 단서는 꽂히지 않고 이유만 한 줄로 보여 준다 (튕겨내는 연출 없음).
//  - 질문마다 [작성 완료] 도장으로 결론을 저장한다 (정답 여부와 무관, 알려 주지도 않는다). 판정은 core(DeductionResolver·EndingResolver)에서만 한다.
// 제출 전 미리보기는 고른 결론과 보고 대상을 문장으로 다시 보여 줄 뿐, 정답·해결 여부·예상 엔딩을 암시하지 않는다.
import {
  canSaveConclusion, claims, isClaimOpen, isVerificationFailed, isVerified, relatedEvidenceIds, saveConclusion, setReportTarget, shownEvidence,
  type Claim, type GameState, type SourceType,
} from '../core';
import { bgmPop, bgmPush, sceneTrack, sfx } from '../audio/audio';
import { el, esc, root } from './hud';
import { popModal, pushModal } from './input';
import { TYPE_LABEL, hypsOf } from './labels';
import { openNotebook } from './notebook';

const TARGETS: { id: NonNullable<GameState['reportTarget']>; label: string }[] = [
  { id: 'eunho_only', label: '박은호에게만 보고한다' },
  { id: 'external', label: '외부 수사기관에도 보고한다' },
];
const NAMES = ['A', 'B', 'C', 'D'];
const FILTERS: { id: SourceType | 'all'; label: string }[] = [{ id: 'all', label: '전체' }, { id: 'physical', label: '물증' }, { id: 'record', label: '기록' }, { id: 'testimony', label: '증언' }, { id: 'context', label: '맥락' }];
type Slot = 's0' | 's1' | 'r0';
interface Draft { hyp: string | null; sup: (string | undefined)[]; reb: string | undefined }
const eq = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function openReport(s: GameState, onSubmit: () => void, opts: { retry?: boolean } = {}) {
  const box = el('div', 'modal report'); box.id = 'report';
  root().append(box);
  bgmPush('report', sceneTrack('report'));
  const nPages = claims.length + 1; // 질문들 + 보고 대상·제출
  let page = 0, zone: 'paper' | 'drawer' = 'paper', pf = 0, dc = 0, filter: SourceType | 'all' = 'all';
  let target: Slot | null = null, held: string | null = null;
  let dd = false, ddc = 0, confirming = false, csel = 0;
  let msg = opts.retry ? '다시 추리하기 — 이전에 쓴 결론이 그대로 채워져 있다. 고쳐서 다시 제출할 수 있다.' : '';
  const drafts: Record<string, Draft> = {};

  const draftOf = (c: Claim): Draft => (drafts[c.claimId] ??= {
    hyp: s.selectedHypothesisByClaim[c.claimId] ?? null,
    sup: [s.submittedEvidenceByClaim[c.claimId]?.[0], s.submittedEvidenceByClaim[c.claimId]?.[1]], reb: s.submittedRebuttalByClaim[c.claimId]?.[0],
  });
  const supOf = (d: Draft) => d.sup.filter(Boolean) as string[];
  const rebOf = (d: Draft) => (d.reb ? [d.reb] : []);
  const stamped = (c: Claim) => { const d = draftOf(c), h = s.selectedHypothesisByClaim[c.claimId]; return !!h && h === d.hyp && eq(s.submittedEvidenceByClaim[c.claimId] ?? [], supOf(d)) && eq(s.submittedRebuttalByClaim[c.claimId] ?? [], rebOf(d)); };
  const slotId = (d: Draft, k: Slot) => (k === 'r0' ? d.reb : d.sup[k === 's0' ? 0 : 1]);
  const titleOf = (id: string) => shownEvidence(s, id)?.title ?? id;
  const hypLabel = (c: Claim, id: string | null) => c.hypotheses.find((h) => h.id === id)?.label ?? '';
  const sentence = (c: Claim, id: string | null) => { const t = c.stem ?? '{}'; const h = hypLabel(c, id); return t.replace('{}', h); };

  // ---- 단서 서랍 ----
  const orderedIds = () => { const rel = s.retryClaimIds.length ? relatedEvidenceIds(s.retryClaimIds) : null; return rel ? [...s.evidenceIds.filter((x) => rel.has(x)), ...s.evidenceIds.filter((x) => !rel.has(x))] : s.evidenceIds.slice(); };
  const listIds = () => orderedIds().filter((id) => filter === 'all' || shownEvidence(s, id)?.sourceType === filter);
  /** 이 카드를 핵심 근거로 꽂을 수 없는 이유 (없으면 '') */
  const why = (id: string) => {
    const e = shownEvidence(s, id)!;
    return e.sourceType === 'context' ? '맥락 단서(배경 자료)는 핵심 근거로 꽂을 수 없다.' : isVerificationFailed(s, id) ? '검증 실패(신빙성 낮음) — 퍼즐의 결론 기회를 모두 써서 검증하지 못했다. 핵심 근거로 꽂을 수 없다.' : !isVerified(s, id) ? '검증되지 않은 단서는 꽂을 수 없다. (퍼즐을 풀어야 한다)' : '';
  };
  const status = (id: string) => (shownEvidence(s, id)!.sourceType === 'context' ? '맥락' : isVerified(s, id) ? '검증' : isVerificationFailed(s, id) ? '검증 실패' : '미검증');

  function place(c: Claim, slot: Slot, id: string): boolean {
    const w = why(id); if (w) { msg = w; render(); return false; }
    const d = draftOf(c);
    d.sup = d.sup.map((x) => (x === id ? undefined : x)); if (d.reb === id) d.reb = undefined; // 같은 카드는 한 칸에만
    if (slot === 'r0') d.reb = id; else d.sup[slot === 's0' ? 0 : 1] = id;
    msg = ''; held = null; target = null; zone = 'paper'; sfx('onUiConfirm'); render(); return true;
  }
  function clear(c: Claim, slot: Slot) { const d = draftOf(c); if (slot === 'r0') d.reb = undefined; else d.sup[slot === 's0' ? 0 : 1] = undefined; msg = ''; render(); }
  function stamp(c: Claim) {
    zone = 'paper'; target = null; held = null;
    const d = draftOf(c);
    if (!canSaveConclusion(d.hyp, rebOf(d))) { msg = '가설을 고르고 예상 반론 칸을 채워야 도장을 찍을 수 있다.'; render(); return; }
    const r = saveConclusion(s, c.claimId, d.hyp!, supOf(d), rebOf(d));
    msg = r.ok ? `질문 ${NAMES[claims.indexOf(c)]} 작성 완료 도장을 찍었다.` : r.reason; // 정답 여부는 알리지 않는다
    sfx('onUiConfirm'); render();
  }
  const pageClaim = () => (page < claims.length ? claims[page] : null);
  const itemsOf = (): string[] => { const c = pageClaim(); return c ? (isClaimOpen(s, c) ? ['blank', 's0', 's1', 'r0', 'stamp'] : []) : ['tg0', 'tg1', 'submit']; };
  const missing = () => claims.filter((c) => isClaimOpen(s, c) && !stamped(c));
  const canSubmit = () => !missing().length && !!s.reportTarget;

  // ---- 그리기 ----
  const cardHtml = (id: string) => { const e = shownEvidence(s, id)!; return `<span class="rcard k-${e.sourceType}"><i class="pin"></i><b class="rk">${TYPE_LABEL[e.sourceType]}</b><span class="rt">${esc(e.title)}</span></span>`; };
  function drawerHtml(): string {
    const ids = listIds(), cur = Math.min(dc, Math.max(ids.length - 1, 0));
    const fil = FILTERS.map((f) => `<button class="rf${filter === f.id ? ' on' : ''}" data-filter="${f.id}">${f.label}</button>`).join('');
    const rows = ids.map((id, i) => {
      const e = shownEvidence(s, id)!, st = status(id);
      return `<button class="dc k-${e.sourceType}${i === cur && zone === 'drawer' ? ' foc' : ''}${held === id ? ' held' : ''}${i === cur ? ' cur' : ''}" data-card="${id}"><b class="rk">${TYPE_LABEL[e.sourceType]}</b><span class="rt">${esc(e.title)}</span><em class="${st === '검증' ? 'ok' : 'no'}">${st === '검증' ? '✓' : st}</em></button>`;
    }).join('') || '<div class="slotlbl" style="padding:3px">이 유형의 단서가 없다.</div>';
    const pv = ids[cur] ? shownEvidence(s, ids[cur]) : undefined;
    const prev = pv ? `<b>${esc(pv.title)}</b> <span class="slotlbl">${TYPE_LABEL[pv.sourceType]} · ${status(pv.id)}</span><br>${esc(pv.description)}` : '<span class="slotlbl">카드를 고르면 여기에 미리보기가 나온다.</span>';
    return `<div class="rfil">${fil}</div><div class="rlist">${rows}</div><div class="rprev">${prev}</div>`;
  }
  function claimHtml(c: Claim): string {
    const i = claims.indexOf(c), d = draftOf(c), fo = itemsOf()[pf], fc = (k: string) => (zone === 'paper' && fo === k ? ' foc' : '');
    const head = `<div class="rq">질문 ${NAMES[i]}. ${esc(c.question)}</div>`;
    if (!isClaimOpen(s, c)) return `${head}<div class="rnote">아직 근거가 정리되지 않아 다룰 수 없는 질문이다. 비워 둔 채로 제출한다.</div>`;
    const [pre, post] = (c.stem ?? '{}').split('{}');
    const blank = `<button class="rblank${d.hyp ? ' filled' : ''}${fc('blank')}" data-blank>${d.hyp ? esc(hypLabel(c, d.hyp)) : '[ ▾ 눌러서 고른다 ]'}</button>`;
    const opts = dd ? `<div class="rdd">${hypsOf(c).map((h, k) => { const lock = !!h.requiresFlag && !s.flags.includes(h.requiresFlag); return `<button class="ropt${k === ddc ? ' foc' : ''}${lock ? ' dis' : ''}" data-opt="${h.id}">${esc(lock ? '(아직 열리지 않은 가설)' : h.label)}</button>`; }).join('')}</div>` : '';
    const slot = (k: Slot, lbl: string) => { const id = slotId(d, k); return `<div class="rslot${fc(k)}${target === k ? ' tgt' : ''}" data-slot="${k}"><span class="rsl">${lbl}</span>${id ? `${cardHtml(id)}<button class="rx" data-clear="${k}" title="떼기">×</button>` : '<span class="slotlbl">(단서 카드를 꽂는다)</span>'}</div>`; };
    const st = stamped(c);
    return `${head}<div class="rstem">${esc(pre)}${blank}${esc(post)}</div>${opts}
      <div class="rlbl">근거 — 이 결론을 받쳐 주는 단서 (2칸, 물증·기록·증언)</div><div class="rslots">${slot('s0', '근거 1')}${slot('s1', '근거 2')}</div>
      <div class="rlbl">예상 반론 — 이 결론에 나올 반론을 막아 주는 단서 (1칸, 필수)</div><div class="rslots">${slot('r0', '예상 반론')}</div>
      <div class="rbot">${st ? '<span class="rstamp">작성 완료</span>' : d.hyp && s.selectedHypothesisByClaim[c.claimId] ? '<span class="rnote">고친 내용은 도장을 다시 찍어야 저장된다.</span>' : ''}<button class="rbtn${fc('stamp')}" data-stamp>${st ? '다시 도장 찍기' : '작성 완료 도장'}</button></div>`;
  }
  /** 완성된 문장으로 읽히는 미리보기 (정답·해결 여부는 말하지 않는다) */
  function previewHtml(): string {
    return claims.map((c, i) => {
      if (!isClaimOpen(s, c)) return `<p><b>질문 ${NAMES[i]}.</b> ${esc(c.question)} — (쓰지 않았다)</p>`;
      const d = draftOf(c), sup = supOf(d).map((id) => `「${esc(titleOf(id))}」`).join('와(과) ') || '(근거 없음)';
      return `<p><b>질문 ${NAMES[i]}.</b> ${esc(c.question)}<br>${d.hyp ? `${esc(sentence(c, d.hyp))} 근거는 ${sup}이다. 예상되는 반론은 ${d.reb ? `「${esc(titleOf(d.reb))}」(으)로 막는다.` : '(아직 없다).'}` : '(결론을 고르지 않았다)'}${stamped(c) ? '' : ' <span class="rnote">· 도장 전</span>'}</p>`;
    }).join('');
  }
  function submitHtml(): string {
    const fo = itemsOf()[pf], fc = (k: string) => (zone === 'paper' && fo === k ? ' foc' : '');
    const tg = TARGETS.map((t, k) => `<button class="rtg${s.reportTarget === t.id ? ' on' : ''}${fc(`tg${k}`)}" data-tg="${t.id}">${s.reportTarget === t.id ? '◉' : '○'} ${esc(t.label)}</button>`).join('');
    const miss = missing(), need = miss.length ? `아직 도장을 찍지 않은 질문: ${miss.map((c) => NAMES[claims.indexOf(c)]).join(', ')}` : !s.reportTarget ? '보고 대상을 고른다.' : '';
    return `<div class="rq">보고 대상과 제출</div><div class="rlbl">보고 대상</div><div class="rtgs">${tg}</div>
      <div class="rlbl">보고서 미리보기</div><div class="rprevfull">${previewHtml()}</div>
      <div class="rbot">${need ? `<span class="rnote">${esc(need)}</span>` : ''}<button class="rbtn${fc('submit')}${canSubmit() ? '' : ' off'}" data-submit>제출한다</button></div>`;
  }
  function render() {
    const tabs = claims.map((c, i) => `<button class="rtab${page === i ? ' sel' : ''}${isClaimOpen(s, c) && stamped(c) ? ' done' : ''}" data-pg="${i}">질문 ${NAMES[i]}</button>`).join('') + `<button class="rtab${page === claims.length ? ' sel' : ''}" data-pg="${claims.length}">보고 대상·제출</button>`;
    const c = pageClaim();
    const ov = confirming ? `<div class="rov"><div class="rovbox"><div class="ovt">보고서를 제출할까요?</div><p>제출하면 결과가 정해진다. 엔딩 뒤에 ‘다시 추리하기’로 결론을 고쳐 다시 제출할 수 있다.</p><div class="rovb"><button class="${csel === 0 ? 'foc' : ''}" data-cf="yes">제출 <kbd>Enter</kbd></button><button class="${csel === 1 ? 'foc' : ''}" data-cf="no">돌아가기 <kbd>Esc</kbd></button></div></div></div>` : '';
    const foot = zone === 'drawer' ? '↑↓ 카드 · ←→ 유형 · Enter 꽂기 · Esc 돌아가기' : '←→ 쪽 넘기기 · ↑↓ 이동 · Enter 선택(칸에서는 서랍 열기) · Del 카드 떼기 · Tab 수첩';
    box.innerHTML = `<div class="rtop"><span class="rh">최종 보고서</span><div class="rtabs">${tabs}</div></div>
      <div class="rdrawer"><div class="rdt">단서 서랍</div>${drawerHtml()}</div>
      <div class="rpaper">${c ? claimHtml(c) : submitHtml()}</div><div class="rmsg">${esc(msg)}</div><div class="foot">${foot}</div>${ov}`;
    box.querySelector('.rlist .cur')?.scrollIntoView({ block: 'nearest' });
  }

  // ---- 동작 ----
  const close = () => { bgmPop('report'); popModal('report'); box.remove(); };
  const hidden = (h: boolean) => { box.style.display = h ? 'none' : ''; };
  const openNb = () => { hidden(true); openNotebook(s, () => { hidden(false); for (const k of Object.keys(drafts)) delete drafts[k]; render(); }); };
  const goPage = (n: number) => { page = (n + nPages) % nPages; pf = 0; dd = false; zone = 'paper'; target = null; held = null; msg = ''; render(); };
  function chooseHyp(c: Claim, id: string) {
    const h = c.hypotheses.find((x) => x.id === id)!;
    if (h.requiresFlag && !s.flags.includes(h.requiresFlag)) { msg = '아직 열리지 않은 가설이다.'; dd = false; render(); return; }
    draftOf(c).hyp = id; dd = false; msg = ''; sfx('onUiConfirm'); render();
  }
  function setTarget(t: ReportTargetId) { setReportTarget(s, t); msg = ''; render(); }
  type ReportTargetId = NonNullable<GameState['reportTarget']>;
  function trySubmit() {
    if (missing().length) { msg = `도장을 찍지 않은 질문이 있다: ${missing().map((c) => NAMES[claims.indexOf(c)]).join(', ')}. (가설 선택 + 예상 반론 필수)`; render(); return; }
    if (!s.reportTarget) { msg = '보고 대상을 고른다.'; render(); return; }
    confirming = true; csel = 0; render();
  }
  function activate() {
    const c = pageClaim(), k = itemsOf()[pf];
    if (c) {
      if (k === 'blank') { dd = true; ddc = Math.max(0, hypsOf(c).findIndex((h) => h.id === draftOf(c).hyp)); render(); }
      else if (k === 's0' || k === 's1' || k === 'r0') { zone = 'drawer'; target = k; msg = '서랍에서 꽂을 카드를 고른다.'; render(); }
      else if (k === 'stamp') stamp(c);
    } else if (k === 'tg0' || k === 'tg1') setTarget(TARGETS[+k.slice(2)].id);
    else if (k === 'submit') trySubmit();
  }
  function placeFromDrawer(id: string) {
    const c = pageClaim(); if (!c || !isClaimOpen(s, c)) return;
    const d = draftOf(c), t: Slot | null = target ?? (!d.sup[0] ? 's0' : !d.sup[1] ? 's1' : !d.reb ? 'r0' : null);
    if (!t) { msg = '칸이 모두 찼다. 바꿀 칸을 먼저 누른다.'; render(); return; }
    place(c, t, id);
  }

  box.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (box.dataset.dragged) return;
    const c = pageClaim();
    if (confirming) { const b = t.closest('[data-cf]') as HTMLElement | null; if (b) { if (b.dataset.cf === 'yes') { sfx('onUiConfirm'); close(); onSubmit(); } else { confirming = false; render(); } } return; }
    const pg = t.closest('[data-pg]') as HTMLElement | null; if (pg) { goPage(+pg.dataset.pg!); return; }
    const fl = t.closest('[data-filter]') as HTMLElement | null; if (fl) { filter = fl.dataset.filter as typeof filter; dc = 0; render(); return; }
    const opt = t.closest('[data-opt]') as HTMLElement | null; if (opt && c) { chooseHyp(c, opt.dataset.opt!); return; }
    if (t.closest('[data-blank]') && c) { dd = !dd; ddc = 0; render(); return; }
    if (dd) { dd = false; render(); return; }
    const cl = t.closest('[data-clear]') as HTMLElement | null; if (cl && c) { clear(c, cl.dataset.clear as Slot); return; }
    const sl = t.closest('[data-slot]') as HTMLElement | null;
    if (sl && c) { const k = sl.dataset.slot as Slot; if (held) place(c, k, held); else { target = k; zone = 'drawer'; msg = '서랍에서 꽂을 카드를 고른다.'; render(); } return; }
    const cd = t.closest('[data-card]') as HTMLElement | null;
    if (cd) { const id = cd.dataset.card!; dc = Math.max(0, listIds().indexOf(id)); if (target && c) place(c, target, id); else { held = held === id ? null : id; zone = 'drawer'; msg = held ? '꽂을 칸을 누른다. (끌어다 놓아도 된다)' : ''; render(); } return; }
    if (t.closest('[data-stamp]') && c) { stamp(c); return; }
    const tg = t.closest('[data-tg]') as HTMLElement | null; if (tg) { setTarget(tg.dataset.tg as ReportTargetId); return; }
    if (t.closest('[data-submit]')) trySubmit();
  });
  // 드래그: 서랍 카드 → 칸
  box.addEventListener('pointerdown', (e) => {
    if (confirming) return;
    const tk = (e.target as HTMLElement).closest('[data-card]') as HTMLElement | null; if (!tk) return;
    const id = tk.dataset.card!, sx = e.clientX, sy = e.clientY, k = root().getBoundingClientRect().width / 480;
    let ghost: HTMLElement | null = null;
    const move = (ev: PointerEvent) => {
      if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) { ghost = el('div', 'rcard ghost', tk.textContent ?? ''); box.append(ghost); }
      if (ghost) { const r = root().getBoundingClientRect(); ghost.style.left = `${(ev.clientX - r.left) / k}px`; ghost.style.top = `${(ev.clientY - r.top) / k}px`; }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      if (!ghost) return;
      ghost.remove();
      const slot = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('[data-slot]') as HTMLElement | null, c = pageClaim();
      if (slot && c) place(c, slot.dataset.slot as Slot, id);
      box.dataset.dragged = '1'; setTimeout(() => delete box.dataset.dragged, 60);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });

  pushModal({
    id: 'report',
    onKey(e) {
      const c = pageClaim();
      if (confirming) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') csel = 1 - csel;
        else if (e.key === 'Enter' && !e.repeat) { if (csel === 0) { sfx('onUiConfirm'); close(); onSubmit(); return; } confirming = false; }
        else if (e.key === 'Escape' && !e.repeat) confirming = false;
        render(); return;
      }
      if (dd && c) {
        const hs = hypsOf(c);
        if (e.key === 'ArrowDown') ddc = (ddc + 1) % hs.length; else if (e.key === 'ArrowUp') ddc = (ddc + hs.length - 1) % hs.length;
        else if (e.key === 'Enter' && !e.repeat) { chooseHyp(c, hs[ddc].id); return; }
        else if (e.key === 'Escape' && !e.repeat) dd = false;
        render(); return;
      }
      if (zone === 'drawer') {
        const ids = listIds();
        if (e.key === 'ArrowDown') dc = ids.length ? (dc + 1) % ids.length : 0; else if (e.key === 'ArrowUp') dc = ids.length ? (dc + ids.length - 1) % ids.length : 0;
        else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const i = FILTERS.findIndex((f) => f.id === filter); filter = FILTERS[(i + (e.key === 'ArrowRight' ? 1 : FILTERS.length - 1)) % FILTERS.length].id; dc = 0; }
        else if (e.key === 'Enter' && !e.repeat) { if (ids[dc]) placeFromDrawer(ids[dc]); return; }
        else if (e.key === 'Escape' && !e.repeat) { zone = 'paper'; target = null; held = null; msg = ''; }
        else return;
        render(); return;
      }
      const n = itemsOf().length;
      if (e.key === 'ArrowRight') { goPage(page + 1); return; }
      if (e.key === 'ArrowLeft') { goPage(page - 1); return; }
      if (e.key === 'ArrowDown') pf = n ? (pf + 1) % n : 0;
      else if (e.key === 'ArrowUp') pf = n ? (pf + n - 1) % n : 0;
      else if ((e.key === 'Delete' || e.key === 'Backspace') && c) { const k = itemsOf()[pf]; if (k === 's0' || k === 's1' || k === 'r0') { clear(c, k); return; } }
      else if (e.key === 'Tab' && !e.repeat) { openNb(); return; }
      else if (e.key === 'Enter' && !e.repeat) { activate(); return; }
      else return;
      render();
    },
  });
  render();
}
