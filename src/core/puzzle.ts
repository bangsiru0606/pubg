// 퍼즐 판정 (여기서만 한다). 규칙(이전계획 11.16, 기획서 4.6):
//  - 퍼즐 조각 = 단서의 핵심 문장. 조각마다 출처(단서·진술 ID)가 있고, 어느 칸에 놓느냐로 판정한다. 근거 카드를 붙이는 단계는 없다.
//  - 결론 확정은 퍼즐마다 한 번이다. 맞든 틀리든 같은 결과("정리함")만 화면에 나가고, 판정 결과는 화면에 내보내지 않는다.
//    맞으면 관련 단서가 검증되고, 틀리면 조용히 미검증으로 남는다 (최종 보고서 제출 뒤 판정에서만 점수를 받지 못한다).
//  - 칸을 자동으로 채우거나 정답 쪽으로 끌어당기는 힌트는 없다. 모든 칸을 채우지 않으면 확정할 수 없다(incomplete).
//  - 보류하고 나가면 놓은 조각이 그대로 저장된다 (벌점 없음).
import { characterName, evidenceById, puzzleById } from './data';
import { isVerified, setFlag } from './state';
import type { GameState, Puzzle, PuzzlePiece, QuizChoice } from './types';

export type PuzzleAnswer = Record<string, string[]>;

export interface PuzzleResult { status: 'settled' | 'incomplete' | 'already_settled' } // 맞고 틀림은 담지 않는다

const sameSet = (a: string[] = [], b: string[] = []) =>
  a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));

/** 추리 문답: 선택지 ID 를 처음 질문부터 따라간다. at = 다음에 답할 질문(null = 마지막 판단까지 끝), valid = 모든 ID 가 길 위에 있다 */
export function quizWalk(p: Puzzle, ids: string[] = []): { chosen: QuizChoice[]; at: string | null; valid: boolean } {
  const q = p.quiz!, chosen: QuizChoice[] = [];
  let at: string | null = q.start;
  for (const id of ids) {
    const c: QuizChoice | undefined = at ? q.nodes[at]?.choices.find((x) => x.id === id) : undefined;
    if (!c) return { chosen, at, valid: false };
    chosen.push(c); at = c.next ?? null;
  }
  return { chosen, at, valid: true };
}
/** 정답이 아닌 길 하나 (각 질문에서 정답 선택지가 아닌 첫 선택지) — F9·시험용 */
export const quizWrongPath = (p: Puzzle) => quizPathBy(p, (cs) => cs.find((c) => !p.correctSlots.path.includes(c.id)) ?? cs[0]);
/** 지나온 판단을 한 문장 결론으로 */
export const quizConclusion = (p: Puzzle, ids: string[]) => [p.quiz!.subject, ...quizWalk(p, ids).chosen.map((c) => c.says)].filter(Boolean).join(' ');
/** 어느 길로든 마지막 판단까지 가는 답 (pick 이 각 질문의 선택지를 고른다) — F9·시험·무작위 시뮬레이션용 */
export function quizPathBy(p: Puzzle, pick: (choices: QuizChoice[]) => QuizChoice): string[] {
  const out: string[] = []; let at: string | null = p.quiz!.start;
  while (at) { const c = pick(p.quiz!.nodes[at].choices); out.push(c.id); at = c.next ?? null; }
  return out;
}

/** 모든 칸이 채워졌는가 (확정 버튼을 누를 수 있는 조건). 추리 문답은 마지막 판단까지 답해야 한다. */
export function isAnswerComplete(p: Puzzle, a: PuzzleAnswer): boolean {
  if (p.quiz) { const w = quizWalk(p, a.path); return w.valid && w.at === null && w.chosen.length > 0; }
  return p.slots.every((slot) => !!a[slot]?.length);
}

/** 칸마다 정답과 같고, 칸이 아닌 곳(문 앞·창가 같은 오답 위치)에는 아무것도 놓지 않았다 */
export function isCorrectAnswer(p: Puzzle, a: PuzzleAnswer): boolean {
  return p.slots.every((slot) => sameSet(a[slot], p.correctSlots[slot])) && Object.entries(a).every(([k, v]) => p.slots.includes(k) || !v?.length);
}

/** 조각·표시의 출처 이름: 단서는 제목, 진술은 "○○의 진술" */
export function sourceName(s: GameState | null, piece: Pick<PuzzlePiece, 'source'> & { srcName?: string }): string {
  if (piece.srcName) return piece.srcName;
  const e = evidenceById.get(piece.source);
  if (e) return e.title;
  const st = s?.statements[piece.source];
  return st ? `${characterName(st.speaker)}의 ${st.speaker === 'han_jisu' ? '관찰' : '진술'}` : piece.source;
}
/** 지금 가진 자료로 화면에 나오는 조각 (출처 단서·진술을 얻었거나, 대화 출처는 그 플래그가 섰을 때) */
export function availablePieces(s: GameState, p: Puzzle): PuzzlePiece[] {
  return (p.tokens ?? []).filter((t) => (t.need ? s.flags.includes(t.need) : evidenceById.has(t.source) ? s.evidenceIds.includes(t.source) : !!s.statements[t.source]));
}

export const slotLabelOf = (p: Puzzle, slot: string) => p.tasks?.find((t) => t.slot === slot)?.label ?? p.boxes?.find((b) => b.id === slot)?.label ?? p.zones?.find((z) => z.id === slot)?.label ?? slot;


export const puzzleDraftOf = (s: GameState, id: string): PuzzleAnswer => s.puzzleDrafts[id] ?? {};
/** 보류하고 나간다: 놓은 조각을 저장한다 (기회·벌점 없음) */
export function savePuzzleDraft(s: GameState, id: string, a: PuzzleAnswer) {
  const cleaned = Object.fromEntries(Object.entries(a).filter(([, v]) => v?.length));
  if (Object.keys(cleaned).length) s.puzzleDrafts[id] = cleaned; else delete s.puzzleDrafts[id];
}

/** 퍼즐을 정리했음을 알리는 플래그 (이야기 진행이 쓴다). 맞았는지는 담지 않는다. */
export const puzzleDoneFlag = (id: string) => `puzzle_done:${id}`;
/** 정리했는가 (맞든 틀리든). solvedPuzzleIds = 맞게 정리, failedPuzzleIds = 틀리게 정리 (이름은 이전 규칙에서 남은 것이다) */
export const isPuzzleSettled = (s: GameState, id: string) => s.solvedPuzzleIds.includes(id) || s.failedPuzzleIds.includes(id);

/** 결론 확정 (한 번뿐). 칸이 비었으면 incomplete. 맞으면 관련 단서가 검증되고, 틀리면 조용히 미검증으로 남는다. 결과는 돌려주지 않는다. */
export function submitPuzzle(s: GameState, puzzleId: string, a: PuzzleAnswer): PuzzleResult {
  const p = puzzleById.get(puzzleId);
  if (!p) throw new Error(`unknown puzzle ${puzzleId}`);
  if (isPuzzleSettled(s, puzzleId)) return { status: 'already_settled' };
  if (!isAnswerComplete(p, a)) return { status: 'incomplete' };
  delete s.puzzleDrafts[puzzleId];
  setFlag(s, puzzleDoneFlag(puzzleId)); setFlag(s, p.flagOnSolve); // 이야기 진행 플래그(질문 열림·정하늘 등장)는 맞고 틀림과 무관하게 선다 (flagOnSolve 는 "정리하면 서는 플래그")
  if (isCorrectAnswer(p, a)) {
    s.solvedPuzzleIds.push(puzzleId);
    for (const id of p.verifiedEvidenceIds) if (s.evidenceIds.includes(id) && !isVerified(s, id)) s.verifiedEvidenceIds.push(id);
  } else { s.failedPuzzleIds.push(puzzleId); s.wrongCountByPuzzle[puzzleId] = 1; } // 틀리게 정리: 화면에는 드러내지 않는다 (등급 집계용)
  return { status: 'settled' };
}

/** 검증하지 못한 단서(엔딩 표시용, 제출 뒤): 틀리게 정리한 퍼즐의 단서, 재료가 모였는데 정리하지 않은 퍼즐의 단서. 가진 단서만. */
export function unverifiedClues(s: GameState, pendingIds: string[]): { failed: string[]; open: string[] } {
  const own = (ids: string[]) => ids.filter((id) => s.evidenceIds.includes(id) && !isVerified(s, id));
  const failed = [...new Set(s.failedPuzzleIds.flatMap((id) => own(puzzleById.get(id)?.verifiedEvidenceIds ?? [])))];
  const open = [...new Set(pendingIds.flatMap((id) => own(puzzleById.get(id)?.verifiedEvidenceIds ?? [])))].filter((id) => !failed.includes(id));
  return { failed, open };
}
