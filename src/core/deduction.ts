import { claimById, claims, evidenceById } from './data';
import { hasFlag, isVerified } from './state';
import type { Claim, GameState } from './types';

export const MAX_SUPPORT_SLOTS = 2;
export const MAX_REBUTTAL_SLOTS = 1;

export interface ClaimResult {
  claimId: string;
  hypothesisPoint: 0 | 1; evidencePoint: 0 | 1; rebuttalPoint: 0 | 1;
  score: number; solved: boolean;
}
export type SubmitConclusion = { ok: true } | { ok: false; reason: string };

/** 결론 저장 (정답 여부는 알려주지 않는다). 근거 슬롯 규칙 위반만 거절한다. */
export function saveConclusion(s: GameState, claimId: string, hypothesisId: string, support: string[], rebuttal: string[]): SubmitConclusion {
  const claim = claimById.get(claimId);
  const hyp = claim?.hypotheses.find((h) => h.id === hypothesisId);
  if (!claim || !hyp) return { ok: false, reason: '알 수 없는 질문 또는 가설' };
  if (claim.requiresFlag && !hasFlag(s, claim.requiresFlag)) return { ok: false, reason: '아직 열리지 않은 질문' };
  if (hyp.requiresFlag && !hasFlag(s, hyp.requiresFlag)) return { ok: false, reason: '아직 열리지 않은 가설' };
  if (support.length > MAX_SUPPORT_SLOTS || rebuttal.length > MAX_REBUTTAL_SLOTS) return { ok: false, reason: '슬롯 수 초과' };
  const all = [...support, ...rebuttal];
  if (new Set(all).size !== all.length) return { ok: false, reason: '같은 자료를 두 슬롯에 넣을 수 없음' };
  for (const id of all) {
    const e = evidenceById.get(id);
    if (!e) return { ok: false, reason: `알 수 없는 단서 ${id}` };
    if (!s.evidenceIds.includes(id)) return { ok: false, reason: '획득하지 않은 단서' };
    if (!isVerified(s, id)) return { ok: false, reason: '검증되지 않은 단서는 근거로 제출할 수 없음' };
    if (e.sourceType === 'context') return { ok: false, reason: '맥락 단서는 핵심 근거 슬롯에 넣을 수 없음' };
  }
  s.selectedHypothesisByClaim[claimId] = hypothesisId;
  s.submittedEvidenceByClaim[claimId] = [...support];
  s.submittedRebuttalByClaim[claimId] = [...rebuttal];
  return { ok: true };
}

/**
 * 가설 1점 + 필수 근거 유형 1점 + 반박 1점 (씬 7). 2점 이상이면서 정답 가설이고 근거 유형 조건을 만족해야 해결.
 * (근거 유형 조건을 필수로 둔 이유: 가설+반박만으로 해결되면 12.1.4·12.1.5 가 깨진다.)
 */
export function resolveClaim(s: GameState, claim: Claim): ClaimResult {
  const hyp = claim.hypotheses.find((h) => h.id === s.selectedHypothesisByClaim[claim.claimId]);
  const ok = (id: string) => s.evidenceIds.includes(id) && isVerified(s, id) && evidenceById.get(id)?.sourceType !== 'context';
  const correct = !!hyp?.isCorrect;
  const eligible = (s.submittedEvidenceByClaim[claim.claimId] ?? []).filter((id) => hyp?.supportEvidenceIds.includes(id) && ok(id));
  const types = new Set(eligible.map((id) => evidenceById.get(id)!.sourceType));
  const hypothesisPoint = correct ? 1 : 0;
  const evidencePoint = correct && types.size >= claim.requiredDistinctSourceTypes ? 1 : 0;
  const rebuttalPoint = correct && (s.submittedRebuttalByClaim[claim.claimId] ?? []).some((id) => hyp!.rebuttalEvidenceIds.includes(id) && ok(id)) ? 1 : 0;
  const score = hypothesisPoint + evidencePoint + rebuttalPoint;
  return { claimId: claim.claimId, hypothesisPoint, evidencePoint, rebuttalPoint, score, solved: hypothesisPoint === 1 && evidencePoint === 1 && score >= 2 };
}

export const resolveAll = (s: GameState) => claims.map((c) => resolveClaim(s, c));
export const solvedClaimIds = (s: GameState) => resolveAll(s).filter((r) => r.solved).map((r) => r.claimId);
