// 씬별 읽기 시간 추정: 대사·독백·원문·퍼즐 안내문 글자 수 / 분당 500자. 실행: npx tsx tools/reading-time.ts
import dlg from '../src/data/dialogue.json' with { type: 'json' };
import ev from '../src/data/evidence.json' with { type: 'json' };
import endingsJson from '../src/data/endings.json' with { type: 'json' };
import puz from '../src/data/puzzles.json' with { type: 'json' };

const count = (s: string) => s.replace(/\s/g, '').length;
const D = dlg.dialogues as Record<string, { nodes: Record<string, { text: string; source: string }> }>;
const chars = (ids: string[]) => ids.flatMap((id) => Object.values(D[id].nodes).map((n) => count(n.text))).reduce((a, b) => a + b, 0);
const E = ev as { id: string; body?: string[]; description: string }[];
const doc = (ids: string[]) => ids.reduce((a, id) => { const e = E.find((x) => x.id === id)!; return a + (e.body ?? [e.description]).reduce((b, l) => b + count(l), 0); }, 0);
type P = { id: string; info?: string[]; tasks?: { label: string; detail?: string; options: { label: string }[] }[]; panels?: { lines?: string[]; evidenceId?: string }[]; conflicts: Record<string, string> };
const pz = (id: string) => {
  const p = (puz as unknown as P[]).find((x) => x.id === id)!;
  return (p.info ?? []).reduce((a, l) => a + count(l), 0) + (p.tasks ?? []).reduce((a, t) => a + count(t.label) + count(t.detail ?? '') + (p.panels ? t.options.reduce((b, o) => b + count(o.label), 0) : 0), 0)
    + (p.panels ?? []).reduce((a, pn) => a + (pn.lines ?? []).reduce((b, l) => b + count(l), 0), 0) + Object.values(p.conflicts).slice(0, 2).reduce((a, l) => a + count(l), 0);
};

// 필수 흐름만 센다 (선택지의 [더 묻기] 같은 추가 대사는 필수 진행에서 제외)
const rows: [string, number, string][] = [
  ['씬 1 (대사+독백+편지)', chars(['eunho_intro', 'closeup_calendar']) + doc(['E01_last_letter']), '목표 2분'],
  ['씬 2 (대사+독백+원문+P01)', chars(['baek_lobby', 'mono_altar', 'mono_wristband', 'mono_p01_solved', 'mono_stairs_locked']) + doc(['E03_preliminary_exam', 'E04_wristband_fragment']) + pz('P01_scene_rebuild'), '목표 4분'],
  ['씬 3 (대사+방송표+원문+P02)', chars(['choi_okja', 'han_yujin', 'chae_soyeon', 'jeong_haneul', 'mono_broadcast', 'mono_floor3_locked', 'mono_p02_solved']) + pz('P02_night_timeline'), '목표 5분'],
  ['씬 4 (대사+원문+P03·P04)', chars(['baek_office', 'oh_miran', 'lee_hyejeong', 'mono_p03_solved', 'mono_p04_solved', 'mono_basement_open']) + doc(['E07_report_revision', 'E09_sedative_gap', 'E05_access_log', 'E10_consent_forms', 'E11_transfer_order']) + pz('P03_revision_diff') + pz('P04_approval_chain'), '목표 6분'],
];
const nodeChars = (d: string, ids: string[]) => ids.reduce((a, id) => a + count(D[d].nodes[id].text), 0);
const optChars = (d: string, id: string) => ((D[d].nodes[id] as unknown as { choices?: { text: string }[] }).choices ?? []).reduce((a, c) => a + count(c.text), 0);
const em = endingsJson as unknown as { endings: { card: string; finalDialogue?: string[][] }[]; lines: Record<string, { text: string }[]> };
const endA = em.endings[0].finalDialogue!.reduce((a, l) => a + count(l[1]), 0) + count(em.endings[0].card) + 3 * 55; // 결과 세 줄은 줄당 약 55자
rows.push(['씬 5 (대사+원문+P05)', chars(['jeong_haneul_final', 'mono_p05_solved']) + doc(['E12_ledger', 'E13_identity_map', 'E14_belongings_diary', 'E15_transport_manifest']) + pz('P05_patient_code'), '목표 6분']);
rows.push(['씬 6 (선택 A 경로)', nodeChars('eunho_message', ['m1', 'm2', 'a1']) + optChars('eunho_message', 'm2'), '목표 2분']);
rows.push(['씬 6 (선택 B 경로)', nodeChars('eunho_message', ['m1', 'm2', 'bc', 'b1', 'b2', 'b3', 'b4']) + optChars('eunho_message', 'm2') + optChars('eunho_message', 'bc'), '목표 2분']);
rows.push(['씬 7 (요약 문장 + 엔딩 A 대본·카드·결과)', 4 * 90 + endA, '목표 5분 (결론 작성·근거 고르기 조작 시간 포함)']);
let total = 0;
for (const [n, c, goal] of rows) { if (!n.includes('선택 B')) total += c; console.log(`${n}: ${c}자 → 읽기 ${(c / 500).toFixed(1)}분 (${goal} 중 읽기 외 이동·조작 포함)`); }
console.log(`씬 1~7 합계(선택 A 경로 기준): ${total}자 → 읽기 ${(total / 500).toFixed(1)}분`);
const all = Object.values(D).flatMap((d) => Object.values(d.nodes));
console.log(`대사 노드 ${all.length}개 (기획서 문장 ${all.filter((n) => n.source === 'spec').length}, 새 문장 ${all.filter((n) => n.source === 'new').length})`);
