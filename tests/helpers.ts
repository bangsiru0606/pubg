// 테스트 공용: 정답 근거를 쓰는 퍼즐 제출. 근거 없이 판정하는 경로는 없으므로(core/puzzle.ts), 토큰만 확인하는 시험은 이 함수로 낸다.
import { acquireEvidence, correctLinksOf, evidenceById, puzzleById, submitPuzzle as submitCore, type GameState, type PuzzleAnswer, type PuzzleLinks } from '../src/core';

/** 허용 근거 카드(단서·진술)를 이미 가진 것으로 만든다 */
export function grantLinks(s: GameState, puzzleId: string) {
  const p = puzzleById.get(puzzleId)!;
  for (const ids of Object.values(p.evidenceLinks ?? {})) for (const id of ids) {
    if (evidenceById.has(id)) { if (!s.evidenceIds.includes(id)) acquireEvidence(s, id); }
    else if (!s.statements[id]) s.statements[id] = { text: id, speaker: 'han_jisu', stage: 'unconfirmed' };
  }
}
/** 정답 근거를 붙여 제출한다 (links 를 주면 그것을 쓴다) */
export function submitPuzzle(s: GameState, puzzleId: string, a: PuzzleAnswer, links?: PuzzleLinks) {
  grantLinks(s, puzzleId);
  return submitCore(s, puzzleId, a, links ?? correctLinksOf(puzzleById.get(puzzleId)!));
}
