// 무작위 제출로 퍼즐이 우연히 풀릴 확률: 결론 기회 3번 안에 (각 시도는 모든 칸을 채운 무작위 답)
//   npx tsx tools/puzzle-sim.ts          → 퍼즐마다 1만 회, 목표 5% 미만
// 무작위 풀이: 조각은 칸(+보관함)에 균등 무작위로 놓되 모든 칸이 채워질 때까지 다시 뽑는다(빈 칸이 있으면 확정할 수 없으므로).
// 표시 선택지는 비어 있지 않은 부분집합(단일 선택은 하나), 트리의 인물 카드·논리표 토큰은 칸마다 균등 무작위. 시도끼리는 서로 모른다(이전 오답을 학습하지 않는다).
import { availablePieces, isAnswerComplete, isCorrectAnswer, puzzles, quizPathBy, type GameState, type Puzzle, type PuzzleAnswer } from '../src/core';
import { applyScene, buildProgress } from '../src/explore/playthrough';
import { rng } from './sfx/generate-sfx';

export const PUZZLE_SCENE: Record<string, number> = { P01_scene_rebuild: 2, P02_night_timeline: 4, P03_revision_diff: 4, P04_approval_chain: 4, P05_patient_code: 5 };
/** 퍼즐이 열리기 직전 상태 (그 씬의 대사·조사까지 마치고 퍼즐은 풀기 전) */
export function stateBeforePuzzle(id: string): GameState {
  const n = PUZZLE_SCENE[id], s = buildProgress(n).state;
  applyScene(s, n, true, { puzzles: false });
  return s;
}

export function randomAnswer(p: Puzzle, s: GameState, r: () => number): PuzzleAnswer {
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  if (p.quiz) return { path: quizPathBy(p, pick) }; // 추리 문답: 질문마다 선택지를 균등 무작위로 고른다
  if (p.layout === 'desktop') { // P03: 최종본의 줄을 무작위로 표시하고, 표시한 줄마다 무작위 사실을 고른다
    const a: PuzzleAnswer = {}, n = p.desktop!.files.find((f) => f.markable)!.lines!.length;
    do { a.marks = Array.from({ length: n }, (_, i) => String(i)).filter(() => r() < 0.5); } while (!a.marks.length);
    for (const m of a.marks) a[`fact_${m}`] = [pick(p.desktop!.factOptions).id];
    return a;
  }
  if (p.layout === 'timeline' && p.boxes?.some((b) => b.other)) { // 모든 조각을 놓는 완전한 배치 중 균등 무작위: 조각을 섞어 앞쪽은 시간표 밖 칸, 나머지는 시간 칸에 하나씩
    const ids = availablePieces(s, p).map((x) => x.id), times = p.boxes.filter((b) => !b.other), out = p.boxes.find((b) => b.other)!;
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const a: PuzzleAnswer = { [out.id]: ids.slice(0, ids.length - times.length) };
    times.forEach((b, i) => { a[b.id] = [ids[ids.length - times.length + i]]; });
    return a;
  }
  for (let tries = 0; tries < 1000; tries++) {
    const a: PuzzleAnswer = {};
    if (p.layout === 'plan' || p.layout === 'timeline') {
      const zones: string[] = [...(p.layout === 'plan' ? (p.zones ?? []).map((z) => z.id) : (p.boxes ?? []).map((b) => b.id)), 'tray'];
      for (const t of availablePieces(s, p)) {
        const z = pick(zones);
        if (z === 'tray') continue;
        if (p.layout === 'timeline' && !p.boxes?.find((b) => b.id === z)?.other) a[z] = [t.id]; else a[z] = [...(a[z] ?? []), t.id]; // 시간 칸은 한 칸에 하나 (나중에 놓은 조각이 대신 들어간다)
      }
    }
    for (const t of p.tasks ?? []) {
      if (t.kind === 'place') a[t.slot] = [pick(t.options).id]; // 트리 칸·논리표 토큰
      else if (t.single) a[t.slot] = [pick(t.options).id];
      else { let sub: string[] = []; while (!sub.length) sub = t.options.filter(() => r() < 0.5).map((o) => o.id); a[t.slot] = sub; }
    }
    if (isAnswerComplete(p, a)) return a;
  }
  throw new Error(`${p.id}: 무작위로 완전한 답을 만들지 못했다`);
}
export function simulate(id: string, o: { trials?: number; attempts?: number; seed?: number } = {}) {
  const { trials = 10000, attempts = 1, seed = 1234 } = o;
  const p = puzzles.find((q) => q.id === id)!, s = stateBeforePuzzle(id), r = rng(seed);
  let solved = 0, first = 0;
  for (let t = 0; t < trials; t++) {
    for (let k = 0; k < attempts; k++) {
      if (isCorrectAnswer(p, randomAnswer(p, s, r))) { solved++; if (k === 0) first++; break; }
    }
  }
  return { id, trials, attempts, solved, rate: solved / trials, firstTry: first / trials, pieces: availablePieces(s, p).length };
}

if (process.argv[1]?.endsWith('puzzle-sim.ts')) {
  console.log('| 퍼즐 | 조각 수 | 한 번 확정에 우연히 맞음 (목표 5% 미만) |\n|---|---|---|');
  for (const p of puzzles) {
    const x = simulate(p.id);
    console.log(`| ${p.id.slice(0, 3)} | ${x.pieces} | ${(x.rate * 100).toFixed(2)}% (${x.solved}/${x.trials}) |`);
  }
  console.log(`\n각 시행: 모든 칸을 채운 무작위 답을 한 번 제출.`);
}
