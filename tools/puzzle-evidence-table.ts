// 퍼즐 정답 칸마다 "어느 근거 카드의 어느 문장으로 알 수 있는가"를 표로 만든다 → docs/퍼즐_근거표.md
//   npx tsx tools/puzzle-evidence-table.ts
// 표의 인용문은 실제 데이터(단서 본문·설명, 진술 문장, 퍼즐 문서 패널)에 있는지 검사하고, 근거가 퍼즐이 열리기 전에 얻어지는지도 검사한다.
// (tests/puzzle-evidence-table.test.ts 가 같은 검사를 한다)
import { readFileSync, writeFileSync } from 'node:fs';
import { evidenceById, puzzles, shownEvidence } from '../src/core';
import real from '../src/data/dialogue.json';
import { areas } from '../src/explore/interaction';
import { PUZZLE_SCENE, stateBeforePuzzle } from './puzzle-sim';

interface Cite { id: string; contains: string; note?: string }
export interface Row { puzzle: string; slot: string; label: string; token: string; cites: Cite[] }

/** 정답 칸마다의 근거 인용 (id: 단서 ID · 진술 ID · "panel:<퍼즐>:<문서 이름>") */
export const ROWS: Row[] = [
  { puzzle: 'P01_scene_rebuild', slot: 'impactPosition', label: '충돌 직후 원장의 위치', token: '기도대 옆 바닥', cites: [{ id: 'E03_preliminary_exam', contains: '발견 위치: 기도대 옆 바닥' }, { id: 'E02_altar_blood', contains: '기도대 받침 아래에 닦이지 않은 혈흔' }] },
  { puzzle: 'P01_scene_rebuild', slot: 'finalPosition', label: '공식 설명 속 원장의 위치', token: '책상 의자', cites: [{ id: 'baek_s_natural', contains: '집무실 의자에 앉으신 채 발견됐고' }] },
  { puzzle: 'P01_scene_rebuild', slot: 'movedObjects', label: '이동된 대상: 원장 시신', token: '원장 시신 (표시)', cites: [{ id: 'E03_preliminary_exam', contains: '발견 위치: 기도대 옆 바닥', note: '↔ 백선우의 진술 "의자에 앉으신 채"와 위치가 다르다' }] },
  { puzzle: 'P01_scene_rebuild', slot: 'movedObjects', label: '이동된 대상: 의자', token: '의자 (표시)', cites: [{ id: 'E04_wristband_fragment', contains: '의자 다리 아래 바닥에 끌린 듯한 긁힌 자국' }] },
  { puzzle: 'P02_night_timeline', slot: 't2234', label: '22:34', token: '청소용 마스터키 분실', cites: [{ id: 'E06_torn_sleeve', contains: '22:34 정하늘이 병실을 나감. 채소연이 맡아 두던 청소용 마스터키도 그때 사라졌다' }] },
  { puzzle: 'P02_night_timeline', slot: 't2241', label: '22:41', token: '원장실 문 개방', cites: [{ id: 'E05_access_log', contains: '22:41 / 청소용 마스터키 사용' }] },
  { puzzle: 'P02_night_timeline', slot: 't2246', label: '22:46', token: '둔탁한 충돌음', cites: [{ id: 'choi_s_thud', contains: '벽시계가 10시 46분이었으니' }] },
  { puzzle: 'P02_night_timeline', slot: 't2251', label: '22:51', token: '정하늘 병실 복귀', cites: [{ id: 'E06_torn_sleeve', contains: '22:51 정하늘이 찢어진 소매 차림으로 병실에 돌아옴' }] },
  { puzzle: 'P02_night_timeline', slot: 'outside', label: '타임라인 바깥 (사람의 동선이 아닌 카드)', token: '기도 설교 방송 시작', cites: [{ id: 'dialogue:mono_broadcast:m', contains: '‘기도 설교’ 칸에는 ‘예약 재생’이라고만 적혀 있다', note: '근거 칸 없음 — 방송표 조사 독백(방송표를 봐야 퍼즐이 열린다)' }, { id: 'choi_s_prayer', contains: '스피커로 목소리가 들렸으니까', note: '최옥자는 직접 보지 않고 스피커 목소리만 들었다' }] },
  { puzzle: 'P03_revision_diff', slot: 'marked', label: '의미가 달라진 항목 ①', token: '발견 위치: 기도대 옆 바닥 → 책상 의자', cites: [{ id: 'E03_preliminary_exam', contains: '발견 위치: 기도대 옆 바닥' }, { id: 'panel:P03_revision_diff:최종 기록', contains: '발견 위치: 책상 의자' }] },
  { puzzle: 'P03_revision_diff', slot: 'marked', label: '의미가 달라진 항목 ②', token: '‘후두부 열상’ 문구 삭제', cites: [{ id: 'E07_report_revision', contains: '삭제: 후두부 열상, 외부 충격 가능' }] },
  { puzzle: 'P03_revision_diff', slot: 'marked', label: '의미가 달라진 항목 ③', token: '‘미약 호흡’ → ‘발견 당시 사망’', cites: [{ id: 'E03_preliminary_exam', contains: '의식없음, 미약 호흡' }, { id: 'panel:P03_revision_diff:최종 기록', contains: '의식 없음, 발견 당시 사망' }] },
  { puzzle: 'P04_approval_chain', slot: 'doc_selection', label: '대상자 선정표', token: '이혜정', cites: [{ id: 'E10_consent_forms', contains: '[대상자 선정표] 작성: LHJ / 권한: 선정', note: 'LHJ = Lee HyeJeong (이혜정)' }] },
  { puzzle: 'P04_approval_chain', slot: 'doc_approval', label: '원장 승인표', token: '이한신', cites: [{ id: 'E10_consent_forms', contains: '[원장 승인표] 작성: LHS / 권한: 최종 승인', note: 'LHS = Lee HanShin (이한신)' }] },
  { puzzle: 'P04_approval_chain', slot: 'doc_schedule', label: '시술 일정표', token: '백선우', cites: [{ id: 'E10_consent_forms', contains: '[시술 일정표] 작성: BSW / 권한: 시술 진행', note: 'BSW = Baek SunWoo (백선우), E07 의 수정 계정 BSW_ADMIN 과 같다' }] },
  { puzzle: 'P04_approval_chain', slot: 'doc_transfer', label: '이송 지시서', token: '이혜정', cites: [{ id: 'E11_transfer_order', contains: '서명: 이혜정 / 권한: 이송 지시' }] },
  { puzzle: 'P05_patient_code', slot: 'ageMatch', label: '장부 항목과 나이가 일치', token: '박은지, 신원 미상 (27세)', cites: [{ id: 'E12_ledger', contains: 'P-271 / B형 / 27세' }] },
  { puzzle: 'P05_patient_code', slot: 'bloodMatch', label: '장부 항목과 혈액형이 일치', token: '박은지, 한유진 (B형)', cites: [{ id: 'E12_ledger', contains: 'P-271 / B형 / 27세' }] },
  { puzzle: 'P05_patient_code', slot: 'admissionMatch', label: '연결표 입원번호와 일치', token: '박은지 (EW-0827)', cites: [{ id: 'E13_identity_map', contains: '환자번호 EW-0827 / P-271' }] },
  { puzzle: 'P05_patient_code', slot: 'belongingMatch', label: '한유진 진술의 유품 표식과 일치', token: '박은지 (노란 실팔찌)', cites: [{ id: 'han_s_bracelet', contains: '노란 실팔찌를 봤어요' }, { id: 'E14_belongings_diary', contains: '노란 실팔찌' }] },
  { puzzle: 'P05_patient_code', slot: 'identity', label: 'P-271 은 누구인가', token: '박은지', cites: [{ id: 'E13_identity_map', contains: '환자번호 EW-0827 / P-271' }] },
  { puzzle: 'P05_patient_code', slot: 'linkedSources', label: '신원 확정에 연결한 자료 (슬롯 자체가 근거 선택)', token: '장부 · 연결표 · 유품 보관함 · 한유진의 진술', cites: [{ id: 'E12_ledger', contains: 'P-271' }, { id: 'E13_identity_map', contains: 'EW-0827' }, { id: 'E14_belongings_diary', contains: '박은지 이름이 적힌 목걸이' }, { id: 'han_s_bracelet', contains: '노란 실팔찌' }] },
];

/** 근거 카드 ID → 원문 전체 (단서: 제목·설명·본문, 진술: 문장, 패널: 줄들) */
export function textOf(id: string, puzzleId?: string): string {
  if (id.startsWith('dialogue:')) { const [, d, n] = id.split(':'); return (real.dialogues as Record<string, { nodes: Record<string, { text: string }> }>)[d].nodes[n].text; }
  if (id.startsWith('panel:')) { const [, pid, title] = id.split(':'); return (puzzles.find((p) => p.id === pid)!.panels ?? []).find((x) => x.title === title)!.lines!.join('\n'); }
  const e = evidenceById.get(id);
  if (e) { const v = shownEvidence({ evidenceIds: [], flags: [], statements: {} } as never, id)!; return [v.title, v.description, ...(v.body ?? [])].join('\n'); }
  for (const d of Object.values(real.dialogues) as { nodes: Record<string, { text: string; statement?: { id: string } }> }[]) for (const n of Object.values(d.nodes)) if (n.statement?.id === id) return n.text;
  void puzzleId; throw new Error(`근거 ${id} 를 찾을 수 없다`);
}
/** 어디서 얻는가 */
export function whereOf(id: string): string {
  if (id.startsWith('panel:')) return '퍼즐 화면의 문서 패널 (퍼즐 자체)';
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
  for (const row of ROWS) {
    const s = stateBeforePuzzle(row.puzzle);
    const texts = row.cites.map((c) => textOf(c.id));
    out.push({ row, ok: row.cites.every((c, i) => texts[i].includes(c.contains)), before: row.cites.map((c) => c.id.startsWith('panel:') || c.id.startsWith('dialogue:') || s.evidenceIds.includes(c.id) || !!s.statements[c.id]), texts });
  }
  return out;
}

if (process.argv[1]?.endsWith('puzzle-evidence-table.ts')) {
  const res = checkRows();
  const names: Record<string, string> = { P01_scene_rebuild: 'P01 현장 위치 재구성', P02_night_timeline: 'P02 야간 동선 시간 배열', P03_revision_diff: 'P03 검안 기록 변조 비교', P04_approval_chain: 'P04 특별 치료 승인 체계', P05_patient_code: 'P05 P-271 환자 코드 대조' };
  const lines = ['# 퍼즐 근거표', '', '> `npx tsx tools/puzzle-evidence-table.ts` 가 만든다. 인용문이 실제 데이터에 있는지, 근거가 퍼즐이 열리기 전에 얻어지는지 검사한 결과다 (`tests/puzzle-evidence-table.test.ts`).', '> 정답 칸마다 근거 카드의 원문 문장으로 알 수 있고, 지워 나가기로만 맞히는 칸은 없다. 판정은 `src/core/puzzle.ts` (토큰과 근거가 모두 맞아야 정답).', ''];
  for (const pid of Object.keys(names)) {
    const p = puzzles.find((q) => q.id === pid)!, scene = PUZZLE_SCENE[pid];
    lines.push(`## ${names[pid]} (씬 ${scene})`, '', `허용 근거: ${Object.entries(p.evidenceLinks ?? {}).map(([sl, ids]) => `\`${sl}\` → ${ids.join(' · ')}`).join(' / ') || '(슬롯 자체가 근거 선택)'}`, '', '| 정답 칸 | 정답 토큰 | 허용 근거 | 그 근거의 원문 문장 | 획득 장소 | 퍼즐이 열리기 전에 얻는가 |', '|---|---|---|---|---|---|');
    for (const r of res.filter((x) => x.row.puzzle === pid)) {
      const c = r.row.cites;
      lines.push(`| ${r.row.slot === 'marked' || r.row.slot === 'movedObjects' ? `${r.row.slot} — ` : ''}${r.row.label} | ${r.row.token} | ${c.map((x) => (x.id.startsWith('dialogue:') ? `방송표 독백 (${x.id.split(':')[1]})` : x.id.replace('panel:', '').split(':').pop())).join('<br>')} | ${c.map((x) => `“${x.contains}”${x.note ? ` (${x.note})` : ''}`).join('<br>')} | ${c.map((x) => whereOf(x.id)).join('<br>')} | ${r.before.every(Boolean) ? '예' : '**아니오**'} |`);
    }
    lines.push('');
  }
  lines.push('## 퍼즐 화면에서 근거를 붙이는 방법', '', '정답 칸에 토큰을 놓으면 그 옆에 [근거 붙이기] 단추가 생긴다. 누르면 가진 단서·진술 전부(맥락 단서 포함)가 목록으로 나오고, 하나를 고르면 붙는다. 맥락 단서(E01)는 고를 수는 있지만 근거로 인정되지 않는다.', '');
  writeFileSync('docs/퍼즐_근거표.md', lines.join('\n'));
  const bad = res.filter((r) => !r.ok || !r.before.every(Boolean));
  console.log(`근거표 ${res.length}줄 → docs/퍼즐_근거표.md${bad.length ? ` (문제 ${bad.length}줄!)` : ' (모두 통과)'}`);
  if (bad.length) { for (const b of bad) console.error(`✗ ${b.row.puzzle}/${b.row.slot}: 인용 ${b.ok ? '있음' : '없음'} · 열리기 전 ${b.before.every(Boolean)}`); process.exit(1); }
  void readFileSync;
}
