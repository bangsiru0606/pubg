// 퍼즐 정답 칸마다 "어느 근거 카드의 어느 문장으로 알 수 있는가"를 표로 만든다 → docs/퍼즐_근거표.md
//   npx tsx tools/puzzle-evidence-table.ts
// 표의 인용문은 실제 데이터(단서 본문·설명, 진술 문장, 퍼즐 문서 패널)에 있는지 검사하고, 근거가 퍼즐이 열리기 전에 얻어지는지도 검사한다.
// (tests/puzzle-evidence-table.test.ts 가 같은 검사를 한다)
import { readFileSync, writeFileSync } from 'node:fs';
import { evidenceById, puzzles, quizConclusion, shownEvidence } from '../src/core';
import real from '../src/data/dialogue.json';
import { areas } from '../src/explore/interaction';
import { PUZZLE_SCENE, stateBeforePuzzle } from './puzzle-sim';

interface Cite { id: string; contains: string; note?: string }
export interface Row { puzzle: string; slot: string; label: string; token: string; cites: Cite[]; why: string } // why: 이 카드가 왜 이 칸의 근거인가 (한 줄)

/** 정답 칸마다의 근거 인용 (id: 단서 ID · 진술 ID · "panel:<퍼즐>:<문서 이름>") */
export const ROWS: Row[] = [
  { puzzle: 'P04_approval_chain', slot: 'doc_selection', label: '대상자 선정표', token: '이혜정', cites: [{ id: 'E10_consent_forms', contains: '[대상자 선정표] 작성: LHJ / 권한: 선정', note: 'LHJ = Lee HyeJeong (이혜정)' }], why: '동의서 묶음의 대상자 선정표가 작성 약자 LHJ 와 선정 권한을 적었고, 이혜정의 로마자 첫 글자와 맞는다.' },
  { puzzle: 'P04_approval_chain', slot: 'doc_approval', label: '원장 승인표', token: '이한신', cites: [{ id: 'E10_consent_forms', contains: '[원장 승인표] 작성: LHS / 권한: 최종 승인', note: 'LHS = Lee HanShin (이한신)' }], why: '원장 승인표의 작성 약자 LHS 와 최종 승인 권한은 이한신의 첫 글자와 직위에 맞는다.' },
  { puzzle: 'P04_approval_chain', slot: 'doc_schedule', label: '시술 일정표', token: '백선우', cites: [{ id: 'E10_consent_forms', contains: '[시술 일정표] 작성: BSW / 권한: 시술 진행', note: 'BSW = Baek SunWoo (백선우), E07 의 수정 계정 BSW_ADMIN 과 같다' }], why: '시술 일정표의 작성 약자 BSW 와 시술 진행 권한은 백선우(수정 계정 BSW_ADMIN 과 같은 약자)에 맞는다.' },
  { puzzle: 'P04_approval_chain', slot: 'doc_transfer', label: '이송 지시서', token: '이혜정', cites: [{ id: 'E11_transfer_order', contains: '서명: 이사 이혜정 / 권한: 이송 지시' }], why: '이송 지시서가 서명(이혜정)과 이송 지시 권한을 직접 적었다.' },
  { puzzle: 'P05_patient_code', slot: 'ageMatch', label: '장부 항목과 나이가 일치', token: '박은지, 신원 미상 (27세)', cites: [{ id: 'E12_ledger', contains: 'P-271 / B형 / 27세' }], why: '장부의 P-271 항목이 나이를 적었고 후보 표의 나이와 대조한다.' },
  { puzzle: 'P05_patient_code', slot: 'bloodMatch', label: '장부 항목과 혈액형이 일치', token: '박은지, 한유진 (B형)', cites: [{ id: 'E12_ledger', contains: 'P-271 / B형 / 27세' }], why: '장부의 P-271 항목이 혈액형을 적었고 후보 표의 혈액형과 대조한다.' },
  { puzzle: 'P05_patient_code', slot: 'admissionMatch', label: '연결표 입원번호와 일치', token: '박은지 (EW-0827)', cites: [{ id: 'E13_identity_map', contains: '환자번호 EW-0827 / P-271' }], why: '연결표가 P-271 과 입원번호를 이어 주므로 후보 표의 입원번호와 대조한다.' },
  { puzzle: 'P05_patient_code', slot: 'belongingMatch', label: '한유진 진술의 유품 표식과 일치', token: '박은지 (노란 실팔찌)', cites: [{ id: 'han_s_bracelet', contains: '노란 실팔찌를 봤어요' }, { id: 'E14_belongings_diary', contains: '노란 실팔찌' }], why: '한유진이 본 노란 실팔찌와 유품 보관함의 유품이 같은 표식이다.' },
  { puzzle: 'P05_patient_code', slot: 'identity', label: 'P-271 은 누구인가', token: '박은지', cites: [{ id: 'E13_identity_map', contains: '환자번호 EW-0827 / P-271' }], why: '연결표가 입원번호 EW-0827 과 P-271 을 이어 신원을 박은지로 가리킨다.' },
  { puzzle: 'P05_patient_code', slot: 'linkedSources', label: '신원 확정에 연결한 자료 (슬롯 자체가 근거 선택)', token: '장부 · 연결표 · 유품 보관함 · 한유진의 진술', cites: [{ id: 'E12_ledger', contains: 'P-271' }, { id: 'E13_identity_map', contains: 'EW-0827' }, { id: 'E14_belongings_diary', contains: '박은지 이름이 적힌 목걸이' }, { id: 'han_s_bracelet', contains: '노란 실팔찌' }], why: '네 자료가 각각 장부·연결표·유품·증언으로 같은 사람을 가리킨다 (운송표는 신원을 말하지 않는다).' },
  { puzzle: 'P03_revision_diff', slot: 'chg_position', label: '‘발견 위치’ 줄의 수정이 숨기려 한 사실', token: '시신이 옮겨졌다', cites: [{ id: 'E03_preliminary_exam', contains: '발견 위치: 기도대 옆 바닥' }, { id: 'E07_report_revision', contains: '삭제: 후두부 열상, 외부 충격 가능' }], why: '수정 전 기록은 기도대 옆 바닥에서 발견했다고 적었는데 최종본은 책상 의자로 바꿨다 — 시신이 옮겨진 사실을 감춘다.' },
  { puzzle: 'P03_revision_diff', slot: 'chg_laceration', label: '‘후두부 열상’ 줄의 수정이 숨기려 한 사실', token: '충돌로 인한 외상', cites: [{ id: 'E03_preliminary_exam', contains: '후두부 열상 및 출혈 흔적' }, { id: 'E07_report_revision', contains: '삭제: 후두부 열상, 외부 충격 가능' }], why: '수정 이력이 후두부 열상과 외부 충격 가능성을 지우고 심장 질환 추정을 넣었다 — 충돌로 인한 외상을 감춘다.' },
  { puzzle: 'P03_revision_diff', slot: 'chg_breath', label: '‘호흡’ 줄의 수정이 숨기려 한 사실', token: '발견 당시 살아 있었다(구조 지연)', cites: [{ id: 'E03_preliminary_exam', contains: '의식없음, 미약 호흡' }, { id: 'E07_report_revision', contains: '추가: 기존 심장 질환에 의한 급성 심정지 추정' }], why: '수정 전에는 미약하게나마 호흡이 있었는데 최종본은 발견 당시 사망으로 바꿨다 — 살아 있던 원장을 구하지 않은 사실(구조 지연)을 감춘다.' },
];

/** 조각 라벨 → 원문에 있어야 하는 인용 조각들: " — " 앞이 인용(뒤는 풀이), "…" 로 이은 부분은 각각 */
export const quoteParts = (label: string) => label.split(' — ')[0].split('…').map((x) => x.trim()).filter(Boolean);
/** 조각(퍼즐 tokens)과 트리 서식 문구에서 자동으로 만든 줄: 조각 → 출처 → 원문 인용 */
export function pieceRows(): Row[] {
  const out: Row[] = [];
  for (const p of puzzles) {
    for (const k of p.tokens ?? []) {
      const slot = p.slots.find((sl) => (p.correctSlots[sl] ?? []).includes(k.id)) ?? (k.decoy ? 'decoy' : '?');
      out.push({ puzzle: p.id, slot, label: k.decoy ? '오답 조각 (놓지 않는다)' : `조각 → ${slot}`, token: k.label, cites: quoteParts(k.label).map((c) => ({ id: k.source, contains: c })), why: k.decoy ? '사건과 직접 관련 없는 자료라서 어느 칸에도 놓지 않는다.' : '출처 자료의 문장이 그 칸의 위치·시각을 말한다.' });
    }
    for (const [nid, n] of Object.entries(p.quiz?.nodes ?? {})) for (const c of n.choices) { // 추리 문답: 선택지 → 출처 → 원문 인용
      const right = p.correctSlots.path.includes(c.id);
      out.push({ puzzle: p.id, slot: right ? 'path' : `path(오답:${nid})`, label: `${nid} ${right ? '정답' : '오답'} 선택지`, token: `${c.judge} — ${c.reason}`, cites: [{ id: c.source, contains: c.quote }], why: right ? '출처 문장이 이 판단의 이유다.' : '출처 하나에 기대어 그럴듯하지만 다른 자료와 부딪힌다.' });
    }
    for (const tk of p.tasks ?? []) if (tk.form) out.push({ puzzle: p.id, slot: tk.slot, label: `${tk.label} 칸의 서식 문구`, token: (p.people ?? []).find((q) => q.id === p.correctSlots[tk.slot][0])?.label ?? '', cites: [{ id: tk.formSource!, contains: tk.form.replace(/ · .*/, '') }], why: '서식 문구의 약자·권한이 그 인물을 가리킨다.' });
  }
  return out;
}

/** 근거 카드 ID → 원문 전체 (단서: 제목·설명·본문, 진술: 문장, 패널: 줄들) */
export function textOf(id: string, puzzleId?: string): string {
  if (id.startsWith('dialogue:')) { const [, d, n] = id.split(':'); return (real.dialogues as Record<string, { nodes: Record<string, { text: string }> }>)[d].nodes[n].text; }
  const e = evidenceById.get(id);
  if (e) { const v = shownEvidence({ evidenceIds: [], flags: [], statements: {} } as never, id)!; return [v.title, v.description, ...(v.body ?? [])].join('\n'); }
  for (const d of Object.values(real.dialogues) as { nodes: Record<string, { text: string; statement?: { id: string } }> }[]) for (const n of Object.values(d.nodes)) if (n.statement?.id === id) return n.text;
  void puzzleId; throw new Error(`근거 ${id} 를 찾을 수 없다`);
}
/** 어디서 얻는가 */
export function whereOf(id: string): string {
  if (id.startsWith('dialogue:')) return '2층 복도 방송표 조사 (독백)';
  const e = evidenceById.get(id);
  if (e) { const a = areas[e.acquiredSceneId]; return `${a?.name ?? e.acquiredSceneId} — 단서 카드`; }
  for (const [dlg, d] of Object.entries(real.dialogues) as [string, { nodes: Record<string, { statement?: { id: string } }> }][]) {
    if (!Object.values(d.nodes).some((n) => n.statement?.id === id)) continue;
    for (const a of Object.values(areas)) if (a.interactables.some((i) => 'dialogueId' in i && i.dialogueId === dlg)) return `${a.name} (${dlg}) — 진술 카드`;
  }
  return '?';
}
export function checkRows() {
  const out: { row: Row; ok: boolean; before: boolean[]; texts: string[] }[] = [];
  for (const row of [...ROWS, ...pieceRows()]) {
    const s = stateBeforePuzzle(row.puzzle);
    const texts = row.cites.map((c) => textOf(c.id));
    out.push({ row, ok: row.cites.every((c, i) => texts[i].includes(c.contains)), before: row.cites.map((c) => c.id.startsWith('dialogue:') || s.evidenceIds.includes(c.id) || !!s.statements[c.id]), texts });
  }
  return out;
}

if (process.argv[1]?.endsWith('puzzle-evidence-table.ts')) {
  const res = checkRows();
  const names: Record<string, string> = { P01_scene_rebuild: 'P01 원장실 추리 문답', P02_night_timeline: 'P02 야간 동선 시간 배열', P03_revision_diff: 'P03 검안 기록 변조 비교 (부원장 PC)', P04_approval_chain: 'P04 특별 치료 승인 체계', P05_patient_code: 'P05 환자 코드 대조' };
  const lines = ['# 퍼즐 근거표', '', '> `npx tsx tools/puzzle-evidence-table.ts` 가 만든다. 퍼즐 조각(= 단서의 핵심 문장) → 출처(단서·진술 ID) → 원문 인용이 실제 데이터에 있는지, 출처가 퍼즐이 열리기 전에 얻어지는지 검사한 결과다 (`tests/puzzle-evidence-table.test.ts` 가 같은 검사를 한다). 근거 카드를 붙이는 단계는 없다 — 조각 자체가 단서 문장이고, 어느 칸에 놓느냐로 판정한다.', ''];
  for (const pid of Object.keys(names)) {
    const p = puzzles.find((q) => q.id === pid)!, scene = PUZZLE_SCENE[pid];
    if (p.quiz) { // P01: 질문 → 선택지(정답/오답) → 근거 단서 원문 → 충돌 문장
      lines.push(`## ${names[pid]} (씬 ${scene})`, '', `결론 기회 3번. 정답 길: ${p.correctSlots.path.join(' → ')}`, '', `정답 결론: ${quizConclusion(p, p.correctSlots.path)}`, '', '| 질문 | 선택지 (판단 — 이유) | 정답? | 출처 | 원문 인용 | 틀렸을 때 충돌 문장 |', '|---|---|---|---|---|---|');
      for (const [nid, n] of Object.entries(p.quiz.nodes)) for (const c of n.choices) lines.push(`| ${nid} ${n.q} | ${c.judge} — ${c.reason} | ${p.correctSlots.path.includes(c.id) ? '정답 길' : '오답'} | ${c.source} | “${c.quote}” | ${c.conflict ?? ''} |`);
      lines.push(''); continue;
    }
    lines.push(`## ${names[pid]} (씬 ${scene})`, '', `결론 기회 3번. 정답: ${p.slots.map((sl) => `\`${sl}\` = ${p.correctSlots[sl].join(' · ')}`).join(' / ')}`, '', '| 칸·조각 | 조각 문구 / 정답 | 출처 | 원문 인용 | 이유 |', '|---|---|---|---|---|');
    for (const r of res.filter((x) => x.row.puzzle === pid)) {
      const c = r.row.cites;
      lines.push(`| ${r.row.label} | ${r.row.token} | ${[...new Set(c.map((x) => (x.id.startsWith('dialogue:') ? `${x.id.split(':')[1]} (독백)` : x.id)))].join(' · ')} | ${c.map((x) => `“${x.contains}”`).join(' · ')} | ${r.row.why} |`);
    }
    lines.push('');
  }
  writeFileSync('docs/퍼즐_근거표.md', lines.join('\n'));
  const bad = res.filter((r) => !r.ok || !r.before.every(Boolean));
  console.log(`근거표 ${res.length}줄 → docs/퍼즐_근거표.md${bad.length ? ` (문제 ${bad.length}줄!)` : ' (모두 통과)'}`);
  if (bad.length) { for (const b of bad) console.error(`✗ ${b.row.puzzle}/${b.row.slot}: ${b.row.token} — 인용 ${b.ok ? '있음' : '없음'} · 열리기 전 ${b.before.every(Boolean)}`); process.exit(1); }
  void readFileSync;
}
