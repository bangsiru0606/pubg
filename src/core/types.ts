export type SourceType = 'physical' | 'record' | 'testimony' | 'context';

export interface Evidence {
  id: string; title: string; description: string; sourceType: SourceType;
  acquiredSceneId: string; sourceCharacterId: string; timestamp: string;
}
export interface Hypothesis {
  id: string; label: string; isCorrect: boolean;
  supportEvidenceIds: string[]; rebuttalEvidenceIds: string[];
  refutedBy: string[]; temptation?: string; requiresFlag?: string;
}
export interface Claim {
  claimId: string; question: string; requiredDistinctSourceTypes: number;
  requiresFlag?: string; hypotheses: Hypothesis[];
}
export type PuzzleType = 'SpatialPlacement' | 'Timeline' | 'DocumentDiff' | 'Connection' | 'LogicGrid';
export interface Puzzle {
  id: string; type: PuzzleType; flagOnSolve: string;
  sourceEvidenceIds: string[]; verifiedEvidenceIds: string[];
  slots: string[]; correctSlots: Record<string, string[]>;
  distractors: string[]; conflicts: Record<string, string>; hintTexts: string[];
}
export interface EndingRules {
  solveAll?: boolean; mustSolve?: string[]; mustNotSolve?: string[]; anyOfSolve?: string[];
  evidenceSecured?: boolean; reportExternally?: boolean;
}
export interface Ending {
  id: string; title: string; rules: EndingRules; results: string[];
  finalDialogue?: string[][]; card: string;
}

export type ReportTarget = 'eunho_only' | 'external';

/** 기획서 10.5 + 추가 필드(submittedRebuttalByClaim, wrongCountByPuzzle, reportTarget). 순수 데이터라 JSON 직렬화 가능. */
export interface GameState {
  currentSceneId: string;
  evidenceIds: string[];
  verifiedEvidenceIds: string[];
  solvedPuzzleIds: string[];
  flags: string[];
  selectedHypothesisByClaim: Record<string, string>;
  submittedEvidenceByClaim: Record<string, string[]>;
  submittedRebuttalByClaim: Record<string, string[]>;
  hintCountByPuzzle: Record<string, number>; // 도달한 힌트 단계(0~3)
  wrongCountByPuzzle: Record<string, number>;
  evidenceSecured: boolean;
  reportTarget: ReportTarget | null;
}
