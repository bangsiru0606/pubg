// 씬 7 최종 보고서: 질문 A~D 결론(수첩에서 저장) + 보고 대상 → 작성 내용 확인 → 제출.
// 제출 전 요약은 플레이어가 고른 결론과 보고 대상을 문장으로 다시 보여 줄 뿐, 정답·해결 여부·예상 엔딩을 암시하지 않는다.
import { claims, setReportTarget, shownEvidence, type Claim, type GameState } from '../core';
import { el, esc, root } from './hud';
import { popModal, pushModal } from './input';
import { openNotebook } from './notebook';

const TARGETS: { id: NonNullable<GameState['reportTarget']>; label: string }[] = [
  { id: 'eunho_only', label: '박은호에게만 보고한다' },
  { id: 'external', label: '외부 수사기관에도 보고한다' },
];
const NAMES = ['A', 'B', 'C', 'D'];

export const isSaved = (s: GameState, c: Claim) => !!s.selectedHypothesisByClaim[c.claimId] && (s.submittedRebuttalByClaim[c.claimId] ?? []).length > 0;

export function openReport(s: GameState, onSubmit: () => void) {
  const box = el('div', 'modal report'); box.id = 'report';
  root().append(box);
  let sel = 0, page: 'main' | 'summary' = 'main', msg = '', sumSel = 0;
  const rows = claims.length + 2; // 질문들 + 보고 대상 + 작성 내용 확인

  const hypLabel = (c: Claim) => c.hypotheses.find((h) => h.id === s.selectedHypothesisByClaim[c.claimId])?.label;
  const titles = (ids: string[] = []) => ids.map((id) => shownEvidence(s, id)?.title ?? '').join(', ') || '(없음)';

  function render() {
    if (page === 'summary') {
      const t = TARGETS.find((x) => x.id === s.reportTarget)!;
      const lines = claims.map((c, i) => `<p>질문 ${NAMES[i]} — ${esc(c.question)}<br>선택한 가설: ${esc(hypLabel(c) ?? '')}<br>지지 근거: ${esc(titles(s.submittedEvidenceByClaim[c.claimId]))} · 반박 근거: ${esc(titles(s.submittedRebuttalByClaim[c.claimId]))}</p>`).join('');
      box.innerHTML = `<h3>제출 전 확인</h3><div class="sum">${lines}<p>보고 대상: ${esc(t.label)}.</p></div>
        <button class="rrow${sumSel === 0 ? ' sel' : ''}" data-s="0">[제출한다]</button><button class="rrow${sumSel === 1 ? ' sel' : ''}" data-s="1">[돌아가서 고친다]</button>
        <div class="foot">↑↓ 이동 · Enter 선택 · Esc 돌아가기</div>`;
      return;
    }
    const qs = claims.map((c, i) => `<button class="rrow${sel === i ? ' sel' : ''}" data-r="${i}">질문 ${NAMES[i]}. ${esc(c.question)} — ${esc(hypLabel(c) ?? '(결론을 아직 저장하지 않았다)')}${isSaved(s, c) ? '' : ''}</button>`).join('');
    const tg = TARGETS.find((x) => x.id === s.reportTarget);
    box.innerHTML = `<h3>최종 보고서</h3>
      <div class="slotlbl">질문마다 Enter 를 누르면 사건 수첩이 열린다. 거기서 가설을 고르고 지지 근거 2개와 반박 근거 1개를 채워 결론을 저장한다.</div>${qs}
      <div class="slotlbl" style="margin-top:4px">보고 대상 — ←→ 로 고른다</div>
      <button class="rrow${sel === claims.length ? ' sel' : ''}" data-r="${claims.length}">${tg ? '◉ ' + esc(tg.label) : '(아직 고르지 않았다)'}</button>
      <button class="rrow${sel === claims.length + 1 ? ' sel' : ''}" data-r="${claims.length + 1}">[작성 내용 확인]</button>
      <div class="note">${esc(msg)}</div><div class="foot">↑↓ 이동 · Enter 선택 · ←→ 보고 대상 · Tab 수첩</div>`;
  }

  function cycleTarget(d: number) {
    const i = TARGETS.findIndex((x) => x.id === s.reportTarget);
    setReportTarget(s, TARGETS[(i < 0 ? (d > 0 ? 0 : TARGETS.length - 1) : (i + d + TARGETS.length) % TARGETS.length)].id); msg = ''; render();
  }
  function activate(i: number) {
    if (i < claims.length) { hidden(true); openNotebook(s, () => { hidden(false); render(); }, 2 + i); return; }
    if (i === claims.length) { cycleTarget(1); return; }
    const missing = claims.filter((c) => !isSaved(s, c));
    if (missing.length) { msg = '결론을 저장하지 않은 질문이 있다. (가설 선택 + 반박 근거 필수)'; render(); return; }
    if (!s.reportTarget) { msg = '보고 대상을 고른다.'; render(); return; }
    page = 'summary'; sumSel = 0; render();
  }
  const hidden = (h: boolean) => { box.style.display = h ? 'none' : ''; };
  const close = () => { popModal('report'); box.remove(); };

  box.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const r = t.closest('[data-r]') as HTMLElement | null, sm = t.closest('[data-s]') as HTMLElement | null;
    if (sm) { sumSel = +sm.dataset.s!; pickSummary(); } else if (r) { sel = +r.dataset.r!; activate(sel); }
  });
  function pickSummary() { if (sumSel === 0) { close(); onSubmit(); } else { page = 'main'; render(); } }

  pushModal({
    id: 'report',
    onKey(e) {
      if (page === 'summary') {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') sumSel = 1 - sumSel;
        else if (e.key === 'Escape') { page = 'main'; }
        else if (e.key === 'Enter' && !e.repeat) { pickSummary(); return; }
        render(); return;
      }
      if (e.key === 'ArrowDown') sel = (sel + 1) % rows;
      else if (e.key === 'ArrowUp') sel = (sel + rows - 1) % rows;
      else if (e.key === 'ArrowRight') cycleTarget(1);
      else if (e.key === 'ArrowLeft') cycleTarget(-1);
      else if (e.key === 'Tab' && !e.repeat) { hidden(true); openNotebook(s, () => { hidden(false); render(); }); return; }
      else if (e.key === 'Enter' && !e.repeat) { activate(sel); return; }
      render();
    },
  });
  render();
}
