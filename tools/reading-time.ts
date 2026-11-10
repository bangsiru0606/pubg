// 씬 1·2 읽기 시간 추정: 대사·독백·원문 글자 수 / 분당 500자. 실행: npx tsx tools/reading-time.ts
import dlg from '../src/data/dialogue.json' with { type: 'json' };
import ev from '../src/data/evidence.json' with { type: 'json' };
import puz from '../src/data/puzzles.json' with { type: 'json' };

const count = (s: string) => s.replace(/\s/g, '').length;
const D = dlg.dialogues as Record<string, { nodes: Record<string, { text: string; source: string }> }>;
const scene1 = ['eunho_intro', 'closeup_calendar'], scene2 = ['baek_lobby', 'mono_altar', 'mono_wristband', 'mono_p01_solved', 'mono_stairs_locked'];
const chars = (ids: string[]) => ids.flatMap((id) => Object.values(D[id].nodes).map((n) => count(n.text))).reduce((a, b) => a + b, 0);
const doc = (id: string) => (ev as { id: string; body?: string[] }[]).find((e) => e.id === id)!.body!.reduce((a, l) => a + count(l), 0);
const p01 = puz[0] as unknown as { info: string[]; tasks: { label: string }[]; conflicts: Record<string, string> };
const puzChars = p01.info.reduce((a, l) => a + count(l), 0) + p01.tasks.reduce((a, t) => a + count(t.label), 0) + Object.values(p01.conflicts).slice(0, 2).reduce((a, l) => a + count(l), 0);

const s1 = chars(scene1) + doc('E01_last_letter'), s2 = chars(scene2) + doc('E03_preliminary_exam') + doc('E04_wristband_fragment') + puzChars;
const rows: [string, number, number][] = [['씬 1 (대사+독백+편지)', s1, 2], ['씬 2 (대사+독백+원문+P01 안내문)', s2, 4]];
let total = 0;
for (const [n, c, goal] of rows) { total += c; console.log(`${n}: ${c}자 → 읽기 ${(c / 500).toFixed(1)}분 (목표 ${goal}분 중 읽기 외 이동·조작 포함)`); }
console.log(`합계: ${total}자 → 읽기 ${(total / 500).toFixed(1)}분 / 씬 1~2 목표 6분`);
const all = Object.values(D).flatMap((d) => Object.values(d.nodes));
console.log(`대사 노드 ${all.length}개 (기획서 문장 ${all.filter((n) => n.source === 'spec').length}, 새 문장 ${all.filter((n) => n.source === 'new').length})`);
