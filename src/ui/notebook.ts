// 사건 수첩 (Tab): 단서 / 진술 / 질문 A~D. 정답 여부는 어디에도 표시하지 않는다.
// 키보드: ←→ 탭, ↑↓ 이동, Enter 실행, Esc/Tab 닫기. 마우스: 클릭.
import {
  CONFLICT_MESSAGE, characterName, MAX_SUPPORT_SLOTS, canSaveConclusion, claims, clearConclusion, shownEvidence, findConflicts, hasFlag,
  isClaimOpen, isVerified, relatedEvidenceIds, saveConclusion, type Claim, type GameState,
} from '../core';
import { el, esc, root } from './hud';
import { sfx } from '../audio/audio';
import { popModal, pushModal } from './input';
import { TYPE_LABEL, areaName } from './labels';
import { openViewer } from './viewer';

type Tab = { id: string; label: string };
const TABS: Tab[] = [{ id: 'evidence', label: '단서' }, { id: 'statements', label: '진술' },
  ...claims.map((c, i) => ({ id: c.claimId, label: `질문 ${'ABCD'[i]}` }))];
const STAGE_LABEL = { unconfirmed: '“ 미확인', contradiction: '≠ 모순', revised: '✎ 수정' } as const; // 색만이 아니라 기호로도 구분

interface Draft { hyp: string | null; support: string[]; rebuttal: string[] }
const VISIBLE_ROWS = 14;

export function openNotebook(s: GameState, onClose: () => void, startTab = 0) {
  const box = el('div', 'modal'); box.id = 'notebook';
  root().append(box); sfx('onPageFlip');
  let tab = startTab;
  const cursor: Record<string, number> = {};
  const drafts: Record<string, Draft> = {};
  let msg = '';
  let picker: { slot: 'support0' | 'support1' | 'rebuttal0'; cursor: number } | null = null;

  const claimOf = (id: string) => claims.find((c) => c.claimId === id);
  const draftOf = (c: Claim): Draft => (drafts[c.claimId] ??= {
    hyp: s.selectedHypothesisByClaim[c.claimId] ?? null,
    support: [...(s.submittedEvidenceByClaim[c.claimId] ?? [])], rebuttal: [...(s.submittedRebuttalByClaim[c.claimId] ?? [])],
  });
  const cur = () => cursor[TABS[tab].id] ?? 0;
  const setCur = (v: number) => { cursor[TABS[tab].id] = v; };
  const close = () => { popModal('notebook'); box.remove(); onClose(); };

  const orderedIds = () => {
    const rel = s.retryClaimIds.length ? relatedEvidenceIds(s.retryClaimIds) : null;
    return rel ? [...s.evidenceIds.filter((x) => rel.has(x)), ...s.evidenceIds.filter((x) => !rel.has(x))] : s.evidenceIds;
  };
  // ---- 탭 본문 ----
  function evidenceTab(): string {
    // 엔딩 D 재도전: 해결하지 못한 질문과 관련된 단서를 먼저 보여 준다 (어느 것이 정답인지는 표시하지 않는다)
    const rel = s.retryClaimIds.length ? relatedEvidenceIds(s.retryClaimIds) : null;
    const ids = orderedIds();
    if (!ids.length) return '<div class="nlist"></div><div class="ndetail note">아직 얻은 단서가 없다.</div>';
    const c = Math.min(cur(), ids.length - 1);
    const start = Math.max(0, Math.min(c - Math.floor(VISIBLE_ROWS / 2), ids.length - VISIBLE_ROWS));
    const rows = ids.slice(start, start + VISIBLE_ROWS).map((id, k) => {
      const i = start + k, e = shownEvidence(s, id)!;
      return `<button class="row${i === c ? ' sel' : ''}" data-row="${i}"><span class="tag t-${e.sourceType}">${TYPE_LABEL[e.sourceType]}</span>${rel?.has(id) ? '<span class="tag">미해결 질문 관련</span>' : ''}${esc(e.title)}${isVerified(s, id) ? '' : ' <span class="unver">·미검증</span>'}</button>`;
    }).join('');
    const e = shownEvidence(s, ids[c])!;
    const ver = isVerified(s, e.id) ? '<span class="ver">검증됨</span>' : '<span class="unver">미검증 (퍼즐을 풀어야 근거로 제출할 수 있다)</span>';
    return `<div class="nlist">${rows}</div><div class="ndetail"><h3>${esc(e.title)}</h3>
      <div class="meta"><span class="tag t-${e.sourceType}">${TYPE_LABEL[e.sourceType]}</span>${ver}</div>
      <div class="meta">${esc(areaName(e.acquiredSceneId))} · ${esc(e.timestamp)}${e.sourceCharacterId ? ' · ' + esc(characterName(e.sourceCharacterId)) : ''}</div>
      <p>${esc(e.description)}</p><button class="row sel" data-open="${e.id}" style="width:auto;display:inline-block">원문 다시 열기 (Enter)</button></div>`;
  }
  function statementsTab(): string {
    const list = Object.entries(s.statements);
    if (!list.length) return '<div class="nlist"></div><div class="ndetail note">기록된 진술이 없다.</div>';
    const rows = list.map(([, st], i) => `<button class="row${i === Math.min(cur(), list.length - 1) ? ' sel' : ''}" data-row="${i}">${esc(characterName(st.speaker))}${st.speaker === 'han_jisu' ? ' 관찰' : ''} <span class="tag">${st.speaker === 'han_jisu' ? '관찰' : STAGE_LABEL[st.stage]}</span></button>`).join('');
    const [, st] = list[Math.min(cur(), list.length - 1)];
    const body = st.stage === 'revised' ? `<s class="st-revised">${esc(st.text)}</s><br><b>${esc(st.revisedText ?? '')}</b>`
      : `<span class="st-${st.stage}">${st.stage === 'unconfirmed' ? '“' + esc(st.text) + '”' : esc(st.text)}</span>`;
    return `<div class="nlist">${rows}</div><div class="ndetail"><h3>${esc(characterName(st.speaker))}의 ${st.speaker === 'han_jisu' ? '관찰' : '진술'}</h3><p>${body}</p></div>`;
  }
  // 가설 표시 순서는 질문마다 다르게 돌려 둔다 (정답이 항상 같은 자리에 오지 않게). 데이터 순서는 그대로.
  const SHIFT = [0, 1, 2, 1];
  const hypsOf = (c: Claim) => { const k = SHIFT[claims.indexOf(c)] % c.hypotheses.length; return [...c.hypotheses.slice(k), ...c.hypotheses.slice(0, k)]; };
  const rowsOfClaim = (c: Claim) => c.hypotheses.length + 5; // 가설들 + 지지1,2 + 반박 + 보류 + 저장
  function claimTab(c: Claim): string {
    if (!isClaimOpen(s, c)) return '<div class="ndetail note">아직 조사가 끝나지 않은 질문이다.</div>';
    const dr = draftOf(c), cc = Math.min(cur(), rowsOfClaim(c) - 1);
    let r = 0;
    const row = (html: string, dis = false) => `<button class="row${r === cc ? ' sel' : ''}${dis ? ' dis' : ''}" data-row="${r++}">${html}</button>`;
    const hyps = hypsOf(c).map((h) => {
      const locked = !!h.requiresFlag && !hasFlag(s, h.requiresFlag);
      return row(`${dr.hyp === h.id ? '◉' : '○'} ${esc(locked ? '(아직 열리지 않은 가설)' : h.label)}`, locked);
    }).join('');
    const slotName = (id?: string) => (id ? esc(shownEvidence(s, id)!.title) : '<span class="slotlbl">(비어 있음)</span>');
    const slots = row(`지지 근거 1: ${slotName(dr.support[0])}`) + row(`지지 근거 2: ${slotName(dr.support[1])}`) + row(`반박 근거: ${slotName(dr.rebuttal[0])}`);
    const ok = canSaveConclusion(dr.hyp, dr.rebuttal);
    const buttons = row('[보류] 저장된 결론 지우기') + row('[결론 저장]', !ok);
    const conflicts = findConflicts([...dr.support, ...dr.rebuttal]);
    const saved = s.selectedHypothesisByClaim[c.claimId] ? '<span class="note">저장된 결론이 있다.</span>' : '';
    return `<div class="ndetail" style="width:100%"><div class="claimq">${esc(c.question)} ${saved}</div>${hyps}<div class="note">결론은 저장만 된다. 확정은 최종 보고서에서 한다.</div><div class="slotlbl" style="margin-top:3px">근거 슬롯 — 지지 최대 ${MAX_SUPPORT_SLOTS}, 반박 1</div>${slots}
      ${conflicts.length ? `<div class="warn">${CONFLICT_MESSAGE}</div>` : ''}${buttons}
      ${!ok ? '<div class="slotlbl">가설을 고르고 반박 근거 슬롯을 채워야 저장할 수 있다.</div>' : ''}<div class="note" id="nbmsg">${esc(msg)}</div></div>`;
  }
  function pickerHtml(c: Claim): string {
    const dr = draftOf(c);
    const used = new Set([...dr.support, ...dr.rebuttal]);
    const list = pickerList(c);
    const rows = ['(비우기)', ...list.map((id) => id)].map((id, i) => {
      if (i === 0) return `<button class="row${picker!.cursor === 0 ? ' sel' : ''}" data-pk="0">(비우기)</button>`;
      const e = shownEvidence(s, id)!;
      const why = pickBlock(id);
      return `<button class="row${picker!.cursor === i ? ' sel' : ''}${why ? ' dis' : ''}" data-pk="${i}"><span class="tag t-${e.sourceType}">${TYPE_LABEL[e.sourceType]}</span>${esc(e.title)}${used.has(id) ? ' ·사용 중' : ''}${why ? ` <span class="unver">·${why}</span>` : ''}</button>`;
    }).join('');
    return `<div class="picker"><div class="slotlbl">자료를 고른다 — ↑↓ · Enter · Esc</div>${rows}</div>`;
  }
  const pickerList = (_c: Claim) => s.evidenceIds.slice();
  const pickBlock = (id: string) => (shownEvidence(s, id)!.sourceType === 'context' ? '맥락' : !isVerified(s, id) ? '미검증' : '');

  function render() {
    const t = TABS[tab];
    const tabs = TABS.map((x, i) => `<button class="tab${i === tab ? ' sel' : ''}" data-tab="${i}">${x.label}</button>`).join('');
    const c = claimOf(t.id);
    const body = t.id === 'evidence' ? evidenceTab() : t.id === 'statements' ? statementsTab() : claimTab(c!);
    box.innerHTML = `<div class="tabs">${tabs}</div><div class="nbody">${body}</div>${picker && c ? pickerHtml(c) : ''}
      <div class="foot">←→ 탭 · ↑↓ 이동 · Enter 선택 · Esc/Tab 닫기</div>`;
  }

  // ---- 동작 ----
  function activate() {
    const t = TABS[tab], c = claimOf(t.id);
    if (t.id === 'evidence') { const ids = orderedIds(); const id = ids[Math.min(cur(), ids.length - 1)]; if (id) openViewer(s, id); return; }
    if (!c || !isClaimOpen(s, c)) return;
    const dr = draftOf(c), i = Math.min(cur(), rowsOfClaim(c) - 1), n = c.hypotheses.length;
    msg = '';
    if (i < n) { const h = hypsOf(c)[i]; if (!h.requiresFlag || hasFlag(s, h.requiresFlag)) dr.hyp = h.id; }
    else if (i < n + 3) picker = { slot: (['support0', 'support1', 'rebuttal0'] as const)[i - n], cursor: 0 };
    else if (i === n + 3) { clearConclusion(s, c.claimId); drafts[c.claimId] = { hyp: null, support: [], rebuttal: [] }; msg = '결론을 보류했다.'; }
    else if (canSaveConclusion(dr.hyp, dr.rebuttal)) {
      const r = saveConclusion(s, c.claimId, dr.hyp!, dr.support, dr.rebuttal);
      msg = r.ok ? '결론을 저장했다.' : r.reason; // 정답 여부는 알리지 않는다
      sfx('onUiConfirm'); // 결과와 무관한 같은 소리 하나
    }
  }
  function pick(c: Claim, idx: number) {
    const dr = draftOf(c), p = picker!;
    const arr = p.slot === 'rebuttal0' ? dr.rebuttal : dr.support;
    const k = p.slot === 'support1' ? 1 : 0;
    if (idx === 0) { arr.splice(k, 1); picker = null; return; }
    const id = pickerList(c)[idx - 1];
    const why = pickBlock(id);
    if (why) { msg = why === '맥락' ? '맥락 단서는 핵심 근거 슬롯에 넣을 수 없다.' : '검증되지 않은 단서는 근거로 제출할 수 없다.'; picker = null; return; }
    for (const a of [dr.support, dr.rebuttal]) { const j = a.indexOf(id); if (j >= 0) a.splice(j, 1); }
    if (p.slot === 'support1' && !dr.support.length) dr.support.push(id); else arr[Math.min(k, arr.length)] = id;
    picker = null;
  }

  box.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const tb = t.closest('[data-tab]') as HTMLElement | null;
    const pk = t.closest('[data-pk]') as HTMLElement | null;
    const op = t.closest('[data-open]') as HTMLElement | null;
    const rw = t.closest('[data-row]') as HTMLElement | null;
    const c = claimOf(TABS[tab].id);
    if (tb) { tab = +tb.dataset.tab!; picker = null; msg = ''; }
    else if (pk && picker && c) { pick(c, +pk.dataset.pk!); }
    else if (op) { openViewer(s, op.dataset.open!); return; }
    else if (rw) { setCur(+rw.dataset.row!); activate(); }
    render();
  });

  pushModal({
    id: 'notebook',
    onKey(e) {
      const c = claimOf(TABS[tab].id);
      if (picker && c) {
        const n = pickerList(c).length + 1;
        if (e.key === 'ArrowDown') picker.cursor = (picker.cursor + 1) % n;
        else if (e.key === 'ArrowUp') picker.cursor = (picker.cursor + n - 1) % n;
        else if (e.key === 'Enter' && !e.repeat) pick(c, picker.cursor);
        else if (e.key === 'Escape') picker = null;
        render(); return;
      }
      if (e.key === 'Escape' || e.key === 'Tab') { if (!e.repeat) close(); return; }
      if (e.key === 'ArrowRight') { tab = (tab + 1) % TABS.length; msg = ''; }
      else if (e.key === 'ArrowLeft') { tab = (tab + TABS.length - 1) % TABS.length; msg = ''; }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const t = TABS[tab].id;
        const n = t === 'evidence' ? s.evidenceIds.length : t === 'statements' ? Object.keys(s.statements).length : rowsOfClaim(claimOf(t)!);
        if (n) setCur((cur() + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
      } else if (e.key === 'Enter' && !e.repeat) activate();
      else return;
      render();
    },
  });
  render();
}
