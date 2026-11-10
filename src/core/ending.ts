import { claims, endingLines, endings } from './data';
import { resolveAll, solvedClaimIds } from './deduction';
import type { Ending, EndingLine, EndingLineKey, GameState, LineWhen } from './types';

/**
 * 엔딩 판정은 여기서만. 위에서부터 처음 맞는 것 (docs/이전계획.md "판정 규칙 확정"):
 *  1) A: 4개 해결 && 증거 보존 && 외부 보고
 *  2) B: A·B 만 해결 (C·D 둘 다 미해결)
 *  3) D: 미해결 2개 이상 || 질문 A 미해결
 *  4) C: 미해결 1개 이하 && (증거 미보존 || 외부 보고 안 함)
 *  5) B: 나머지
 * 기획서 10.4 의사코드와 순서가 다른 이유: 7장의 D 조건("2개 이상 오답")을 C 보다 먼저 적용하기 위해.
 */
export function resolveEnding(s: GameState): Ending {
  const solved = new Set(solvedClaimIds(s));
  const unsolved = claims.length - solved.size;
  const external = s.reportTarget === 'external';
  const id =
    unsolved === 0 && s.evidenceSecured && external ? 'ending_a'
    : solved.size === 2 && solved.has('claim_a') && solved.has('claim_b') ? 'ending_b'
    : unsolved >= 2 || !solved.has('claim_a') ? 'ending_d'
    : !s.evidenceSecured || !external ? 'ending_c'
    : 'ending_b';
  return endings.find((e) => e.id === id)!;
}

function matches(w: LineWhen, s: GameState, solved: Set<string>): boolean {
  return (w.solved ?? []).every((c) => solved.has(c)) &&
    (w.notSolved ?? []).every((c) => !solved.has(c)) &&
    (!w.anySolved || w.anySolved.some((c) => solved.has(c))) &&
    (w.secured === undefined || s.evidenceSecured === w.secured) &&
    (w.external === undefined || (s.reportTarget === 'external') === w.external);
}

/** 결과 본문 세 줄 (정하늘 / 조직 / 박은호). 질문별 해결 여부와 증거 보존·보고 여부로 고른다. */
export function resolveEndingLines(s: GameState): Record<EndingLineKey, EndingLine> {
  const solved = new Set(solvedClaimIds(s));
  const pick = (k: EndingLineKey) => endingLines[k].find((l) => matches(l.when, s, solved))!;
  return { haneul: pick('haneul'), organization: pick('organization'), eunho: pick('eunho') };
}

export interface ClaimGrade { claimId: string; solved: boolean; rebuttalHit: boolean; score: number }
export interface Grade {
  claims: ClaimGrade[]; total: number; max: number; letter: 'S' | 'A' | 'B' | 'C';
  wrongTotal: number; hintedPuzzles: number; maxHintLevel: number; // 힌트는 엔딩이 아니라 등급에만 표시한다
}
/** 엔딩 후 추리 등급: 질문별 해결 여부, 반박 근거 적중, 퍼즐 오답·힌트 사용 */
export function gradeOf(s: GameState): Grade {
  const rs = resolveAll(s);
  const cg = rs.map((r) => ({ claimId: r.claimId, solved: r.solved, rebuttalHit: r.rebuttalPoint === 1, score: r.score }));
  const total = cg.reduce((a, c) => a + c.score, 0), max = claims.length * 3;
  const hints = Object.values(s.hintCountByPuzzle);
  return {
    claims: cg, total, max, letter: total === max ? 'S' : total >= 10 ? 'A' : total >= 7 ? 'B' : 'C',
    wrongTotal: Object.values(s.wrongCountByPuzzle).reduce((a, b) => a + b, 0),
    hintedPuzzles: hints.filter((h) => h > 0).length, maxHintLevel: Math.max(0, ...hints),
  };
}

/** 엔딩 D 재도전: 해결하지 못한 질문과 관련된 단서 ID (가설 지지·반박·반증 자료의 합집합 — 어느 것이 정답인지는 구분하지 않는다) */
export function relatedEvidenceIds(claimIds: string[]): Set<string> {
  const out = new Set<string>();
  for (const c of claims) if (claimIds.includes(c.claimId))
    for (const h of c.hypotheses) [...h.supportEvidenceIds, ...h.rebuttalEvidenceIds, ...h.refutedBy].forEach((id) => out.add(id));
  return out;
}
