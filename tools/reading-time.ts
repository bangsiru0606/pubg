// 씬별 읽기 시간 추정: 대사·독백·원문·퍼즐 안내문 글자 수 / 분당 500자. 실행: npx tsx tools/reading-time.ts
import dlg from '../src/data/dialogue.json' with { type: 'json' };
import ev from '../src/data/evidence.json' with { type: 'json' };
import puz from '../src/data/puzzles.json' with { type: 'json' };

const count = (s: string) => s.replace(/\s/g, '').length;
const D = dlg.dialogues as Record<string, { nodes: Record<string, { text: string; source: string }> }>;
const chars = (ids: string[]) => ids.flatMap((id) => Object.values(D[id].nodes).map((n) => count(n.text))).reduce((a, b) => a + b, 0);
const E = ev as { id: string; body?: string[]; description: string }[];
const doc = (ids: string[]) => ids.reduce((a, id) => { const e = E.find((x) => x.id === id)!; return a + (e.body ?? [e.description]).reduce((b, l) => b + count(l), 0); }, 0);
type P = { id: string; info?: string[]; tasks?: { label: string; detail?: string; options: { label: string }[] }[]; panels?: { lines: string[] }[]; conflicts: Record<string, string> };
const pz = (id: string) => {
  const p = (puz as unknown as P[]).find((x) => x.id === id)!;
  return (p.info ?? []).reduce((a, l) => a + count(l), 0) + (p.tasks ?? []).reduce((a, t) => a + count(t.label) + count(t.detail ?? '') + (p.panels ? t.options.reduce((b, o) => b + count(o.label), 0) : 0), 0)
    + (p.panels ?? []).reduce((a, pn) => a + pn.lines.reduce((b, l) => b + count(l), 0), 0) + Object.values(p.conflicts).slice(0, 2).reduce((a, l) => a + count(l), 0);
};

// 필수 흐름만 센다 (선택지의 [더 묻기] 같은 추가 대사는 필수 진행에서 제외)
const rows: [string, number, string][] = [
  ['씬 1 (대사+독백+편지)', chars(['eunho_intro', 'closeup_calendar']) + doc(['E01_last_letter']), '목표 2분'],
  ['씬 2 (대사+독백+원문+P01)', chars(['baek_lobby', 'mono_altar', 'mono_wristband', 'mono_p01_solved', 'mono_stairs_locked']) + doc(['E03_preliminary_exam', 'E04_wristband_fragment']) + pz('P01_scene_rebuild'), '목표 4분'],
  ['씬 3 (대사+방송표+원문+P02)', chars(['choi_okja', 'han_yujin', 'chae_soyeon', 'jeong_haneul', 'mono_broadcast', 'mono_floor3_locked', 'mono_p02_solved']) + pz('P02_night_timeline'), '목표 5분'],
  ['씬 4 (대사+원문+P03·P04)', chars(['baek_office', 'oh_miran', 'lee_hyejeong', 'mono_p03_solved', 'mono_p04_solved', 'mono_basement_open']) + doc(['E07_report_revision', 'E09_sedative_gap', 'E05_access_log', 'E10_consent_forms', 'E11_transfer_order']) + pz('P03_revision_diff') + pz('P04_approval_chain'), '목표 6분'],
];
let total = 0;
for (const [n, c, goal] of rows) { total += c; console.log(`${n}: ${c}자 → 읽기 ${(c / 500).toFixed(1)}분 (${goal} 중 읽기 외 이동·조작 포함)`); }
console.log(`합계: ${total}자 → 읽기 ${(total / 500).toFixed(1)}분`);
const all = Object.values(D).flatMap((d) => Object.values(d.nodes));
console.log(`대사 노드 ${all.length}개 (기획서 문장 ${all.filter((n) => n.source === 'spec').length}, 새 문장 ${all.filter((n) => n.source === 'new').length})`);
