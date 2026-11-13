import { claimById, claims, conflictPairs, evidenceById } from './data';
import { hasFlag, isUnsettledClue, isVerified } from './state';
import type { Claim, GameState } from './types';

export const MAX_SUPPORT_SLOTS = 2;
export const REQUIRED_SUPPORT = 2; // 점수를 받으려면 정답 가설의 맞는 근거가 이만큼 있어야 한다 (유형은 묻지 않는다)
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
    if (isUnsettledClue(s, id)) return { ok: false, reason: '아직 정리하지 않은 사건의 자료' }; // 틀리게 정리한 단서는 꽂을 수 있고, 점수만 받지 못한다 (resolveClaim)
    if (e.sourceType === 'context') return { ok: false, reason: '맥락 단서는 핵심 근거 슬롯에 넣을 수 없음' };
  }
  s.selectedHypothesisByClaim[claimId] = hypothesisId;
  s.submittedEvidenceByClaim[claimId] = [...support];
  s.submittedRebuttalByClaim[claimId] = [...rebuttal];
  return { ok: true };
}

/**
 * 가설 1점 + 근거 1점 + 반박 1점 (씬 7). 2점 이상이면서 정답 가설이고 근거 조건을 만족해야 해결.
 * 근거 조건: 정답 가설의 맞는 근거 2개 (5차 피드백: "출처 유형이 서로 달라야 한다"는 조건은 없앴다. 화면에는 증거·증언 2분류만 보여 플레이어가 알 수 없고, 기록 둘이 정답인 질문 C·D 가 해결되지 않았다.)
 * 가설+반박만으로 해결되면 12.1.4·12.1.5 가 깨지므로 근거 조건은 필수로 둔다.
 */
export function resolveClaim(s: GameState, claim: Claim): ClaimResult {
  const hyp = claim.hypotheses.find((h) => h.id === s.selectedHypothesisByClaim[claim.claimId]);
  const ok = (id: string) => s.evidenceIds.includes(id) && isVerified(s, id) && evidenceById.get(id)?.sourceType !== 'context';
  const correct = !!hyp?.isCorrect;
  const eligible = (s.submittedEvidenceByClaim[claim.claimId] ?? []).filter((id) => hyp?.supportEvidenceIds.includes(id) && ok(id));
  const hypothesisPoint = correct ? 1 : 0;
  const evidencePoint = correct && new Set(eligible).size >= REQUIRED_SUPPORT ? 1 : 0;
  const rebuttalPoint = correct && (s.submittedRebuttalByClaim[claim.claimId] ?? []).some((id) => hyp!.rebuttalEvidenceIds.includes(id) && ok(id)) ? 1 : 0;
  const score = hypothesisPoint + evidencePoint + rebuttalPoint;
  return { claimId: claim.claimId, hypothesisPoint, evidencePoint, rebuttalPoint, score, solved: hypothesisPoint === 1 && evidencePoint === 1 && score >= 2 };
}

export const resolveAll = (s: GameState) => claims.map((c) => resolveClaim(s, c));
export const solvedClaimIds = (s: GameState) => resolveAll(s).filter((r) => r.solved).map((r) => r.claimId);

/** UI 규칙: 반박 슬롯이 비어 있으면 결론을 제출(저장)할 수 없다. 반박이 맞았는지는 점수·등급에만 반영된다. */
export const isRebuttalFilled = (rebuttal: string[]) => rebuttal.length >= MAX_REBUTTAL_SLOTS;
export const canSaveConclusion = (hypothesisId: string | null, rebuttal: string[]) => !!hypothesisId && isRebuttalFilled(rebuttal);

/** 보류: 저장된 결론을 지운다 */
export function clearConclusion(s: GameState, claimId: string) {
  delete s.selectedHypothesisByClaim[claimId];
  delete s.submittedEvidenceByClaim[claimId];
  delete s.submittedRebuttalByClaim[claimId];
}

/** 열려 있는 질문 */
export const isClaimOpen = (s: GameState, claim: Claim) => !claim.requiresFlag || hasFlag(s, claim.requiresFlag);

/**
 * 4.4 근거 충돌 중립 경고. 충돌 쌍은 src/data/conflicts.json 에 명시한 것만 쓴다(자동 추론 없음).
 * 현재 단서 16개는 모두 사실이라 목록은 비어 있다. 어느 쪽이 거짓인지는 알려주지 않는다.
 */
export const CONFLICT_MESSAGE = '이 자료들은 동시에 참일 수 없다.';
export function findConflicts(ids: string[], pairs: [string, string][] = conflictPairs): [string, string][] {
  return pairs.filter(([a, b]) => ids.includes(a) && ids.includes(b));
}
