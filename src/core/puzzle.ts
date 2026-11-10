import { puzzleById } from './data';
import { setFlag, isVerified } from './state';
import type { GameState, Puzzle } from './types';

export type PuzzleAnswer = Record<string, string[]>;

export interface PuzzleHint {
  level: number; text: string;
  highlightEvidenceIds: string[];
  removedTokens: string[];                                // 단계 2: 잘못된 후보 하나 제거 ("slot:token" 또는 "*:token")
  autoFill: { slotId: string; tokens: string[] } | null;  // 단계 3: 한 슬롯 자동 완성
}
export interface PuzzleResult {
  status: 'solved' | 'wrong' | 'incomplete' | 'already_solved';
  conflicts: string[]; // 충돌하는 항목만 알려 준다. 정답은 알려주지 않는다.
  hint: PuzzleHint;
}

const sameSet = (a: string[] = [], b: string[] = []) =>
  a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));

/** 오답 횟수 → 힌트 단계. 2·4·6회에서 정확히 1·2·3단계 */
export const hintLevelFor = (wrongCount: number) => (wrongCount >= 6 ? 3 : wrongCount >= 4 ? 2 : wrongCount >= 2 ? 1 : 0);

export function isCorrectAnswer(p: Puzzle, a: PuzzleAnswer): boolean {
  return p.slots.every((slot) => sameSet(a[slot], p.correctSlots[slot]));
}

function conflictsOf(p: Puzzle, a: PuzzleAnswer): string[] {
  const out = new Set<string>();
  for (const [slot, tokens] of Object.entries(a))
    for (const t of tokens) {
      const m = p.conflicts[`${slot}:${t}`] ?? p.conflicts[`*:${t}`];
      if (m) out.add(m);
    }
  return [...out];
}

export function hintFor(p: Puzzle, wrongCount: number, a: PuzzleAnswer = {}): PuzzleHint {
  const level = hintLevelFor(wrongCount);
  const removed = level >= 2 && p.distractors.length ? [p.distractors[0]] : [];
  let autoFill: PuzzleHint['autoFill'] = null;
  if (level >= 3) {
    const slotId = p.slots.find((s) => !sameSet(a[s], p.correctSlots[s]));
    if (slotId) autoFill = { slotId, tokens: p.correctSlots[slotId] };
  }
  return {
    level, text: level ? (p.hintTexts[level - 1] ?? '') : '',
    highlightEvidenceIds: level >= 1 ? p.sourceEvidenceIds : [], removedTokens: removed, autoFill,
  };
}

/** 퍼즐 답 제출. 빈 슬롯이 있으면 incomplete(오답 횟수 증가 없음). 정답이면 검증·플래그 처리. */
export function submitPuzzle(s: GameState, puzzleId: string, a: PuzzleAnswer): PuzzleResult {
  const p = puzzleById.get(puzzleId);
  if (!p) throw new Error(`unknown puzzle ${puzzleId}`);
  const wrong = s.wrongCountByPuzzle[puzzleId] ?? 0;
  if (s.solvedPuzzleIds.includes(puzzleId)) return { status: 'already_solved', conflicts: [], hint: hintFor(p, wrong, a) };
  if (p.slots.some((slot) => !a[slot]?.length)) return { status: 'incomplete', conflicts: [], hint: hintFor(p, wrong, a) };

  if (isCorrectAnswer(p, a)) {
    s.solvedPuzzleIds.push(puzzleId);
    setFlag(s, p.flagOnSolve);
    for (const id of p.verifiedEvidenceIds) if (s.evidenceIds.includes(id) && !isVerified(s, id)) s.verifiedEvidenceIds.push(id);
    return { status: 'solved', conflicts: [], hint: hintFor(p, wrong, a) };
  }
  const n = wrong + 1;
  s.wrongCountByPuzzle[puzzleId] = n;
  const hint = hintFor(p, n, a);
  s.hintCountByPuzzle[puzzleId] = hint.level;
  return { status: 'wrong', conflicts: conflictsOf(p, a), hint };
}
