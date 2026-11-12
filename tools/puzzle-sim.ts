// 무작위 제출로 퍼즐이 우연히 풀릴 확률 (docs: 근거 연결 판정 전/후 비교)
//   npx tsx tools/puzzle-sim.ts          → 퍼즐마다 1만 회, 오답 5회 이내(= 6번째 제출까지)에 풀리는 비율
// 무작위 풀이: 모든 칸을 채운 완전한 답만 낸다(빈 칸이 있으면 오답 횟수가 오르지 않으므로). 토큰은 칸마다 균등 무작위,
// 표시 칩은 비어 있지 않은 부분집합 중 균등 무작위, 근거는 그 시점에 가진 단서·진술 전부 중 균등 무작위.
import { isCorrectAnswer, linkCandidates, linksCorrect, puzzles, type GameState, type Puzzle, type PuzzleAnswer, type PuzzleLinks } from '../src/core';
import { applyScene, buildProgress } from '../src/explore/playthrough';
import { rng } from './sfx/generate-sfx';

export const PUZZLE_SCENE: Record<string, number> = { P01_scene_rebuild: 2, P02_night_timeline: 4, P03_revision_diff: 4, P04_approval_chain: 4, P05_patient_code: 5 };
/** 퍼즐이 열리기 직전 상태 (그 씬의 대사·조사까지 마치고 퍼즐은 풀기 전) */
export function stateBeforePuzzle(id: string): GameState {
  const n = PUZZLE_SCENE[id], s = buildProgress(n).state;
  applyScene(s, n, true, { puzzles: false });
  return s;
}

/** 수정 전의 표시 선택지 수 (P03 은 이번에 선택지를 5개에서 7개로 늘렸다) */
const OLD_OPTION_COUNT: Record<string, number> = { P03_revision_diff: 5 };
export function randomAnswer(p: Puzzle, r: () => number, legacy = false): PuzzleAnswer {
  const a: PuzzleAnswer = Object.fromEntries(p.slots.map((sl) => [sl, [] as string[]]));
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  if (p.layout === 'timeline') { // 카드 5장 중 4장을 시간 칸에 (순서 무작위), 나머지는 바깥
    const toks = (p.tokens ?? []).map((t) => t.id);
    for (let i = toks.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [toks[i], toks[j]] = [toks[j], toks[i]]; } // Fisher-Yates
    p.boxes!.forEach((b, i) => { a[b.id] = [toks[i]]; });
    return a;
  }
  for (const t of p.tasks ?? []) {
    if (t.kind === 'place') a[t.slot] = [pick(t.options).id];
    else { const opts = legacy && OLD_OPTION_COUNT[p.id] ? t.options.slice(0, OLD_OPTION_COUNT[p.id]) : t.options; let sub: string[] = []; while (!sub.length) sub = opts.filter(() => r() < 0.5).map((o) => o.id); a[t.slot] = sub; }
  }
  return a;
}
export function randomLinks(p: Puzzle, s: GameState, r: () => number): PuzzleLinks {
  const cands = linkCandidates(s), out: PuzzleLinks = {};
  for (const sl of Object.keys(p.evidenceLinks ?? {})) out[sl] = cands[Math.floor(r() * cands.length)].id;
  return out;
}
export function simulate(id: string, o: { trials?: number; attempts?: number; useLinks?: boolean; seed?: number } = {}) {
  const { trials = 10000, attempts = 6, useLinks = true, seed = 1234 } = o;
  const p = puzzles.find((q) => q.id === id)!, s = stateBeforePuzzle(id), r = rng(seed);
  let solved = 0, perAttempt = 0;
  for (let t = 0; t < trials; t++) {
    for (let k = 0; k < attempts; k++) {
      const a = randomAnswer(p, r, !useLinks), ok = isCorrectAnswer(p, a) && (!useLinks || linksCorrect(s, p, randomLinks(p, s, r)));
      if (ok) { solved++; if (k === 0) perAttempt++; break; }
    }
  }
  return { id, trials, attempts, solved, rate: solved / trials, firstTry: perAttempt / trials, candidates: linkCandidates(s).length };
}

if (process.argv[1]?.endsWith('puzzle-sim.ts')) {
  console.log('| 퍼즐 | 근거 후보 수 | 수정 전 (토큰만) | 수정 후 (토큰+근거) |\n|---|---|---|---|');
  for (const p of puzzles) {
    const before = simulate(p.id, { useLinks: false }), after = simulate(p.id, { useLinks: true });
    console.log(`| ${p.id.slice(0, 3)} | ${after.candidates} | ${(before.rate * 100).toFixed(2)}% (${before.solved}/${before.trials}) | ${(after.rate * 100).toFixed(2)}% (${after.solved}/${after.trials}) |`);
  }
  console.log(`\n각 시행: 무작위 완전 답을 최대 ${6}번 제출 (오답 5회 이내 = 힌트 3단계 전).`);
}
