import { claims, endings } from './data';
import { solvedClaimIds } from './deduction';
import type { Ending, GameState } from './types';

/** 엔딩 판정은 여기서만. endings.json 순서대로 규칙을 검사하고, rules 가 빈 마지막 엔딩이 기본값(else). */
export function resolveEnding(s: GameState): Ending {
  const solved = new Set(solvedClaimIds(s));
  const match = (r: Ending['rules']) =>
    (!r.solveAll || claims.every((c) => solved.has(c.claimId))) &&
    (r.mustSolve ?? []).every((c) => solved.has(c)) &&
    (r.mustNotSolve ?? []).every((c) => !solved.has(c)) &&
    (!r.anyOfSolve || r.anyOfSolve.some((c) => solved.has(c))) &&
    (r.evidenceSecured === undefined || s.evidenceSecured === r.evidenceSecured) &&
    (r.reportExternally === undefined || (s.reportTarget === 'external') === r.reportExternally);
  return endings.find((e) => Object.keys(e.rules).length > 0 && match(e.rules)) ?? endings[endings.length - 1];
}
