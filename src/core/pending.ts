// 미결 사건: 재료(열림 조건)가 모두 모였는데 아직 풀지 못한 퍼즐. 수첩의 "미결 사건" 탭과 자동 개방이 같은 규칙을 쓴다. (순수 TS)
import { puzzles } from './data';
import type { GameState, Puzzle } from './types';

export const puzzleReady = (s: GameState, p: Puzzle) =>
  !!p.layout && !!p.openWhen && !s.solvedPuzzleIds.includes(p.id) &&
  (p.openWhen.flags ?? []).every((f) => s.flags.includes(f)) && (p.openWhen.evidence ?? []).every((id) => s.evidenceIds.includes(id));
export const pendingPuzzles = (s: GameState) => puzzles.filter((p) => puzzleReady(s, p));
