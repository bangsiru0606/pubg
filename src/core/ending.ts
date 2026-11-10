import { claims, endingLines, endings } from './data';
import { solvedClaimIds } from './deduction';
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
