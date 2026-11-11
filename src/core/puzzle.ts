import { characterName, evidenceById, puzzleById } from './data';
import { isVerified, setFlag, shownEvidence } from './state';
import type { GameState, Puzzle } from './types';

export type PuzzleAnswer = Record<string, string[]>;
/** 슬롯 → 붙인 근거 카드 (단서 ID 또는 진술 ID). 퍼즐 데이터에 evidenceLinks 가 있는 슬롯만 쓴다. */
export type PuzzleLinks = Record<string, string>;

export interface PuzzleHint {
  level: number; text: string;
  highlightEvidenceIds: string[];
  removedTokens: string[];                                // 단계 2: 잘못된 후보 하나 제거 ("slot:token" 또는 "*:token")
  autoFill: { slotId: string; tokens: string[]; link?: string } | null;  // 단계 3: 한 슬롯 자동 완성 (토큰과 근거를 함께)
}
export interface PuzzleResult {
  status: 'solved' | 'wrong' | 'incomplete' | 'already_solved';
  missingLinks?: string[]; // incomplete 인 이유가 근거 칸이면 그 슬롯들 (화면이 근거 칸을 강조한다)
  conflicts: string[]; // 오답이면 문장 하나만(근거 문제가 우선, 그다음 토큰 충돌). 어느 자료와 맞지 않는지 이름으로 말하고 정답은 알려 주지 않는다.
  hint: PuzzleHint;
}

const sameSet = (a: string[] = [], b: string[] = []) =>
  a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));

/** 오답 횟수 → 힌트 단계. 2·4·6회에서 정확히 1·2·3단계 */
export const hintLevelFor = (wrongCount: number) => (wrongCount >= 6 ? 3 : wrongCount >= 4 ? 2 : wrongCount >= 2 ? 1 : 0);

export function isCorrectAnswer(p: Puzzle, a: PuzzleAnswer): boolean {
  return p.slots.every((slot) => sameSet(a[slot], p.correctSlots[slot]));
}

/** 토큰 충돌 문장들 (슬롯 순서). 화면에는 첫 번째 하나만 보여 준다. */
function conflictsOf(p: Puzzle, a: PuzzleAnswer): string[] {
  const out: string[] = [];
  const add = (m?: string) => { if (m && !out.includes(m)) out.push(m); };
  for (const slot of p.slots)
    for (const t of a[slot] ?? []) add(p.conflicts[`${slot}:${t}`] ?? p.conflicts[`*:${t}`]);
  for (const [slot, tokens] of Object.entries(a)) if (!p.slots.includes(slot)) for (const t of tokens) add(p.conflicts[`${slot}:${t}`] ?? p.conflicts[`*:${t}`]); // 타임라인 바깥 등 슬롯 밖 카드
  // "slot:!token": 정답에 있어야 할 항목이 빠졌을 때 충돌하는 자료
  for (const slot of p.slots)
    for (const t of p.correctSlots[slot]) {
      const m = p.conflicts[`${slot}:!${t}`];
      if (m && a[slot]?.length && !a[slot].includes(t)) add(m);
    }
  return out;
}

export const slotLabelOf = (p: Puzzle, slot: string) => p.tasks?.find((t) => t.slot === slot)?.label ?? p.boxes?.find((b) => b.id === slot)?.label ?? slot;
/** 근거 카드의 이름: 단서는 제목, 진술은 "화자의 진술: “문장”" */
export function linkTitle(s: GameState, id: string): string {
  const e = shownEvidence(s, id);
  if (e) return e.title;
  const st = s.statements[id];
  return st ? `${characterName(st.speaker)}의 진술` : id;
}
/** 근거로 인정하는가: 그 칸의 허용 목록에 있고, 플레이어가 가진 단서·진술이며, 맥락(context) 단서가 아니다 */
export function linkAccepted(s: GameState, p: Puzzle, slot: string, id: string | undefined): boolean {
  if (!id || !(p.evidenceLinks?.[slot] ?? []).includes(id)) return false;
  const e = evidenceById.get(id);
  if (e) return e.sourceType !== 'context' && s.evidenceIds.includes(id);
  return !!s.statements[id];
}
/** 붙인 근거가 모든 근거 칸에서 인정되는가 */
export const linksCorrect = (s: GameState, p: Puzzle, links: PuzzleLinks) => linkProblem(s, p, links) === null;
export const isLinkSlot = (p: Puzzle, slot: string) => !!p.evidenceLinks?.[slot]?.length;
/** 정답 근거 (허용 목록의 첫 번째): 자동 채우기·시험용 풀이에 쓴다 */
export const correctLinksOf = (p: Puzzle): PuzzleLinks => Object.fromEntries(Object.entries(p.evidenceLinks ?? {}).map(([k, v]) => [k, v[0]]));
/** 근거를 붙이지 않은 칸 (슬롯 순서) — 제출은 incomplete 로 처리하고 오답 횟수를 올리지 않는다 */
export const missingLinkSlots = (p: Puzzle, links: PuzzleLinks): string[] => p.slots.filter((sl) => isLinkSlot(p, sl) && !links[sl]);
/** 근거 문제 문장 (슬롯 순서로 첫 번째 하나): 붙였지만 그 칸의 내용을 말해 주지 않는 자료 */
function linkProblem(s: GameState, p: Puzzle, links: PuzzleLinks): string | null {
  for (const slot of p.slots) {
    if (!isLinkSlot(p, slot)) continue;
    const id = links[slot], label = slotLabelOf(p, slot);
    if (!id) continue;
    if (!linkAccepted(s, p, slot, id)) return `「${linkTitle(s, id)}」은(는) ‘${label}’ 칸의 내용을 말해 주지 않는다.`;
  }
  return null;
}

export function hintFor(p: Puzzle, wrongCount: number, a: PuzzleAnswer = {}, links: PuzzleLinks = {}): PuzzleHint {
  const level = hintLevelFor(wrongCount);
  const removed = level >= 2 && p.distractors.length ? [p.distractors[0]] : [];
  let autoFill: PuzzleHint['autoFill'] = null;
  if (level >= 3) {
    // 토큰이 틀렸거나 근거가 비었거나 틀린 첫 칸을, 토큰과 근거를 함께 채운다
    const slotId = p.slots.find((sl) => !sameSet(a[sl], p.correctSlots[sl]) || (isLinkSlot(p, sl) && !(p.evidenceLinks![sl] ?? []).includes(links[sl])));
    if (slotId) autoFill = { slotId, tokens: p.correctSlots[slotId], ...(isLinkSlot(p, slotId) ? { link: p.evidenceLinks![slotId][0] } : {}) };
  }
  return {
    level, text: level ? (p.hintTexts[level - 1] ?? '') : '',
    highlightEvidenceIds: level >= 1 ? p.sourceEvidenceIds : [], removedTokens: removed, autoFill,
  };
}

/**
 * 퍼즐 답 제출. links(슬롯별 근거 카드)는 필수다: 토큰과 근거가 모두 맞아야 정답이고, 근거 없이 판정하는 경로는 없다.
 * 토큰 칸이 비었거나 근거를 붙이지 않은 칸이 있으면 incomplete(오답 횟수·힌트 단계는 오르지 않는다). 붙였지만 틀리면 wrong.
 */
export function submitPuzzle(s: GameState, puzzleId: string, a: PuzzleAnswer, links: PuzzleLinks): PuzzleResult {
  const p = puzzleById.get(puzzleId);
  if (!p) throw new Error(`unknown puzzle ${puzzleId}`);
  const wrong = s.wrongCountByPuzzle[puzzleId] ?? 0;
  if (s.solvedPuzzleIds.includes(puzzleId)) return { status: 'already_solved', conflicts: [], hint: hintFor(p, wrong, a, links) };
  if (p.slots.some((slot) => !a[slot]?.length)) return { status: 'incomplete', conflicts: [], hint: hintFor(p, wrong, a, links) };
  const missing = missingLinkSlots(p, links);
  if (missing.length) return { status: 'incomplete', conflicts: [], missingLinks: missing, hint: hintFor(p, wrong, a, links) };

  const problem = linkProblem(s, p, links);
  if (isCorrectAnswer(p, a) && !problem) {
    s.solvedPuzzleIds.push(puzzleId);
    setFlag(s, p.flagOnSolve);
    for (const id of p.verifiedEvidenceIds) if (s.evidenceIds.includes(id) && !isVerified(s, id)) s.verifiedEvidenceIds.push(id);
    return { status: 'solved', conflicts: [], hint: hintFor(p, wrong, a, links) };
  }
  const n = wrong + 1;
  s.wrongCountByPuzzle[puzzleId] = n;
  const hint = hintFor(p, n, a, links);
  s.hintCountByPuzzle[puzzleId] = hint.level;
  const one = problem ?? conflictsOf(p, a)[0]; // 오답 피드백은 한 번에 하나만: 근거 문제가 먼저, 그다음 토큰 충돌
  return { status: 'wrong', conflicts: one ? [one] : [], hint };
}

export interface LinkCandidate { id: string; kind: 'evidence' | 'statement'; title: string; detail: string }
/** 근거 칸에 붙일 수 있는 카드: 가진 단서와 진술 전부 (정답 근거만 추리지 않는다. 맥락 단서도 고를 수는 있으나 인정되지 않는다.) */
export function linkCandidates(s: GameState): LinkCandidate[] {
  return [
    ...s.evidenceIds.map((id) => { const e = shownEvidence(s, id)!; return { id, kind: 'evidence' as const, title: e.title, detail: e.description }; }),
    ...Object.entries(s.statements).map(([id, st]) => ({ id, kind: 'statement' as const, title: `${characterName(st.speaker)}의 진술`, detail: `“${st.stage === 'revised' && st.revisedText ? st.revisedText : st.text}”` })),
  ];
}
