import { evidenceById, puzzles } from './data';
import type { GameState } from './types';

export function createGameState(): GameState {
  return {
    currentSceneId: 'office', evidenceIds: [], verifiedEvidenceIds: [], solvedPuzzleIds: [], flags: [],
    selectedHypothesisByClaim: {}, submittedEvidenceByClaim: {}, submittedRebuttalByClaim: {},
    hintCountByPuzzle: {}, wrongCountByPuzzle: {}, evidenceSecured: false, reportTarget: null,
  };
}

// 아래 함수들은 state 를 제자리에서 바꾼다 (저장 가능한 순수 데이터).

export const hasFlag = (s: GameState, f: string) => s.flags.includes(f);
export function setFlag(s: GameState, f: string) { if (!hasFlag(s, f)) s.flags.push(f); }

/** 이 단서를 검증해 주는 퍼즐이 있는가 */
const verifierOf = (id: string) => puzzles.find((p) => p.verifiedEvidenceIds.includes(id));

/** 단서 획득. 검증 퍼즐이 없거나 이미 해결됐으면 바로 검증, 아니면 미검증. 새로 얻었으면 true. */
export function acquireEvidence(s: GameState, id: string): boolean {
  if (!evidenceById.has(id)) throw new Error(`unknown evidence ${id}`);
  if (s.evidenceIds.includes(id)) return false;
  s.evidenceIds.push(id);
  const v = verifierOf(id);
  if (!v || s.solvedPuzzleIds.includes(v.id)) s.verifiedEvidenceIds.push(id);
  return true;
}

export const isVerified = (s: GameState, id: string) => s.verifiedEvidenceIds.includes(id);

/** 증거 보존 선택 (씬 6). 선택 A: E16 + evidenceSecured. 선택 B(즉시 대면): 아무것도 얻지 못한다. */
export function chooseEvidencePreservation(s: GameState, secure: boolean) {
  if (secure) { acquireEvidence(s, 'E16_secure_receipt'); s.evidenceSecured = true; setFlag(s, 'flag_evidence_secured'); }
  else setFlag(s, 'flag_confronted_immediately');
}

export function setReportTarget(s: GameState, t: GameState['reportTarget']) { s.reportTarget = t; }

/** 지하 계단 개방 조건 (기획서 4장 "지하 개방 조건"): P03 + P04 */
export const isBasementOpen = (s: GameState) =>
  s.solvedPuzzleIds.includes('P03_revision_diff') && s.solvedPuzzleIds.includes('P04_approval_chain');
