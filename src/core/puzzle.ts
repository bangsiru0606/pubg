// 퍼즐 판정 (여기서만 한다). 규칙(이전계획 11.12, 기획서 4.6):
//  - 퍼즐 조각 = 단서의 핵심 문장. 조각마다 출처(단서·진술 ID)가 있고, 어느 칸에 놓느냐로 판정한다. 근거 카드를 붙이는 단계는 없다.
//  - 결론 기회는 퍼즐마다 3번. 1번째 오답: 충돌 문장 하나 + 힌트 문장, 2번째 오답: 충돌 문장 하나 + 틀린 후보 하나 제거, 3번째 오답: 검증 실패(퍼즐이 닫힌다).
//  - 칸을 자동으로 채우거나 정답 쪽으로 끌어당기는 힌트는 없다. 모든 칸을 채우지 않으면 확정할 수 없고(incomplete) 기회도 줄지 않는다.
//  - 보류하고 나가면 놓은 조각이 그대로 저장되고 기회는 줄지 않는다.
import { characterName, evidenceById, puzzleById } from './data';
import { isVerified, setFlag } from './state';
import type { GameState, Puzzle, PuzzlePiece, QuizChoice } from './types';

export type PuzzleAnswer = Record<string, string[]>;
export const MAX_ATTEMPTS = 3;

export interface PuzzleHint { level: number; text: string; removedTokens: string[] } // removedTokens: 단계 2에서 제거한 틀린 후보 ("slot:token" 또는 "*:token")
export interface PuzzleResult {
  status: 'solved' | 'wrong' | 'incomplete' | 'already_solved' | 'failed' | 'closed';
  conflicts: string[]; // 오답이면 문장 하나만. 어느 자료와 맞지 않는지 이름으로 말하고 정답은 알려 주지 않는다.
  hint: PuzzleHint;
  remaining: number; // 남은 결론 기회 (MAX_ATTEMPTS - 오답 횟수)
}

const sameSet = (a: string[] = [], b: string[] = []) =>
  a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));

/** 오답 횟수 → 힌트 단계: 1번째 오답 = 1단계(힌트 문장), 2번째 오답 = 2단계(틀린 후보 제거). 3번째는 검증 실패. */
export const hintLevelFor = (wrongCount: number) => Math.min(Math.max(wrongCount, 0), 2);
export const attemptsLeft = (s: GameState, id: string) => Math.max(0, MAX_ATTEMPTS - (s.wrongCountByPuzzle[id] ?? 0));

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
export const quizConclusion = (p: Puzzle, ids: string[]) => [p.quiz!.subject, ...quizWalk(p, ids).chosen.map((c) => c.says)].join(' ');
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

/** 충돌 문장들 (슬롯 순서). 화면에는 첫 번째 하나만 보여 준다. */
function conflictsOf(s: GameState, p: Puzzle, a: PuzzleAnswer): string[] {
  if (p.quiz) { const ok = p.correctSlots.path; const c = quizWalk(p, a.path).chosen.find((x) => !ok.includes(x.id) && x.conflict); return c ? [c.conflict!] : []; } // 처음 틀린 판단과 부딪히는 자료 하나
  const out: string[] = [];
  const add = (m?: string) => { if (m && !out.includes(m)) out.push(m); };
  const piece = (id: string) => p.tokens?.find((t) => t.id === id);
  const keys = [...p.slots, ...Object.keys(a).filter((k) => !p.slots.includes(k))];
  for (const slot of keys) {
    for (const t of a[slot] ?? []) {
      const pc = piece(t), right = (p.correctSlots[slot] ?? []).includes(t);
      add(p.conflicts[`${slot}:${t}`] ?? p.conflicts[`*:${t}`]);
      if (pc && !right) add((p.pieceConflict ?? '「{src}」은(는) 이 칸과 맞지 않는다.').replace('{src}', sourceName(s, pc)));
    }
  }
  // "slot:!token": 정답에 있어야 할 항목이 빠졌을 때 충돌하는 자료
  for (const slot of p.slots)
    for (const t of p.correctSlots[slot]) {
      const m = p.conflicts[`${slot}:!${t}`];
      if (m && a[slot]?.length && !a[slot].includes(t)) add(m);
    }
  return out;
}

export const slotLabelOf = (p: Puzzle, slot: string) => p.tasks?.find((t) => t.slot === slot)?.label ?? p.boxes?.find((b) => b.id === slot)?.label ?? p.zones?.find((z) => z.id === slot)?.label ?? slot;

export function hintFor(p: Puzzle, wrongCount: number): PuzzleHint {
  const level = hintLevelFor(wrongCount);
  return { level, text: level ? (p.hintTexts[level - 1] ?? '') : '', removedTokens: level >= 2 && p.distractors.length ? [p.distractors[0]] : [] };
}

export const puzzleDraftOf = (s: GameState, id: string): PuzzleAnswer => s.puzzleDrafts[id] ?? {};
/** 보류하고 나간다: 놓은 조각을 저장한다 (기회·벌점 없음) */
export function savePuzzleDraft(s: GameState, id: string, a: PuzzleAnswer) {
  const cleaned = Object.fromEntries(Object.entries(a).filter(([, v]) => v?.length));
  if (Object.keys(cleaned).length) s.puzzleDrafts[id] = cleaned; else delete s.puzzleDrafts[id];
}

/** 퍼즐이 풀렸거나 검증 실패로 닫혔음을 알리는 플래그 (이야기 진행이 쓴다) */
export const puzzleDoneFlag = (id: string) => `puzzle_done:${id}`;
export const puzzleFailedFlag = (id: string) => `puzzle_failed:${id}`;

/** 결론 확정. 칸이 비었으면 incomplete(기회 그대로). 틀리면 기회 하나를 잃고, 3번째 오답이면 검증 실패로 닫힌다. */
export function submitPuzzle(s: GameState, puzzleId: string, a: PuzzleAnswer): PuzzleResult {
  const p = puzzleById.get(puzzleId);
  if (!p) throw new Error(`unknown puzzle ${puzzleId}`);
  const wrong = s.wrongCountByPuzzle[puzzleId] ?? 0;
  const base = { conflicts: [] as string[], hint: hintFor(p, wrong), remaining: MAX_ATTEMPTS - wrong };
  if (s.solvedPuzzleIds.includes(puzzleId)) return { status: 'already_solved', ...base };
  if (s.failedPuzzleIds.includes(puzzleId)) return { status: 'closed', ...base };
  if (!isAnswerComplete(p, a)) return { status: 'incomplete', ...base };

  if (isCorrectAnswer(p, a)) {
    s.solvedPuzzleIds.push(puzzleId);
    setFlag(s, p.flagOnSolve); setFlag(s, puzzleDoneFlag(puzzleId));
    delete s.puzzleDrafts[puzzleId];
    for (const id of p.verifiedEvidenceIds) if (s.evidenceIds.includes(id) && !isVerified(s, id)) s.verifiedEvidenceIds.push(id);
    return { status: 'solved', ...base };
  }
  const n = wrong + 1;
  s.wrongCountByPuzzle[puzzleId] = n;
  const hint = hintFor(p, n);
  s.hintCountByPuzzle[puzzleId] = hint.level;
  const one = conflictsOf(s, p, a)[0];
  if (n >= MAX_ATTEMPTS) { // 검증 실패: 퍼즐이 닫히고 관련 단서는 핵심 근거로 쓸 수 없다
    s.failedPuzzleIds.push(puzzleId); setFlag(s, puzzleDoneFlag(puzzleId)); setFlag(s, puzzleFailedFlag(puzzleId));
    delete s.puzzleDrafts[puzzleId];
    return { status: 'failed', conflicts: one ? [one] : [], hint, remaining: 0 };
  }
  s.puzzleDrafts[puzzleId] = Object.fromEntries(Object.entries(a).filter(([, v]) => v?.length)); // 틀린 답도 그대로 저장해 이어서 고칠 수 있다
  return { status: 'wrong', conflicts: one ? [one] : [], hint, remaining: MAX_ATTEMPTS - n };
}

/** 검증하지 못한 단서(엔딩·보고서 표시용): 검증 실패한 퍼즐의 단서, 재료가 모였는데 풀지 못한 퍼즐의 단서. 가진 단서만. */
export function unverifiedClues(s: GameState, pendingIds: string[]): { failed: string[]; open: string[] } {
  const own = (ids: string[]) => ids.filter((id) => s.evidenceIds.includes(id) && !isVerified(s, id));
  const failed = [...new Set(s.failedPuzzleIds.flatMap((id) => own(puzzleById.get(id)?.verifiedEvidenceIds ?? [])))];
  const open = [...new Set(pendingIds.flatMap((id) => own(puzzleById.get(id)?.verifiedEvidenceIds ?? [])))].filter((id) => !failed.includes(id));
  return { failed, open };
}
