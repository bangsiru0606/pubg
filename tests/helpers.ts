// 테스트 공용: 퍼즐 제출 (조각을 칸에 놓은 답을 판정한다). 근거 카드 단계는 없다 (core/puzzle.ts).
import { submitPuzzle as submitCore, type GameState, type PuzzleAnswer } from '../src/core';

export function submitPuzzle(s: GameState, puzzleId: string, a: PuzzleAnswer) {
  return submitCore(s, puzzleId, a);
}
