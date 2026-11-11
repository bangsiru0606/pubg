export type SourceType = 'physical' | 'record' | 'testimony' | 'context';

export interface Evidence {
  id: string; title: string; description: string; sourceType: SourceType;
  acquiredSceneId: string; sourceCharacterId: string; timestamp: string;
  afterView?: string;  // 원문을 닫으면 켜지는 플래그
  newText?: string[];  // body 중 새로 쓴 줄 (보고용)
  body?: string[];   // 원문(문서 전문). HTML 로 표시한다
  illust?: string;
  reveal?: { flag: string; title?: string; description?: string; sourceCharacterId?: string }; // 플래그가 서면 표시 이름·설명이 바뀐다   // 원문 보기 배경 일러스트 (public/assets/illust/<이름>.webp)
}
export interface Hypothesis {
  id: string; label: string; isCorrect: boolean;
  supportEvidenceIds: string[]; rebuttalEvidenceIds: string[];
  refutedBy: string[]; temptation?: string; requiresFlag?: string;
}
export interface Claim {
  claimId: string; question: string; requiredDistinctSourceTypes: number;
  requiresFlag?: string; hypotheses: Hypothesis[];
  relatedEvidenceIds: string[]; // 엔딩 D 재도전에서 "관련" 으로 먼저 보여 줄 단서 (그 질문을 다루는 장면에서 얻는 것, 정답 근거만이 아니다)
}
export type PuzzleType = 'SpatialPlacement' | 'Timeline' | 'DocumentDiff' | 'Connection' | 'LogicGrid';
export interface PuzzleTask { slot: string; label: string; token?: string; detail?: string; kind: 'place' | 'mark'; options: { id: string; label: string }[] }
export interface PuzzleBox { id: string; label: string; sub?: string; x: number; y: number; w: number; h: number } // 평면도 좌표(%)
export interface Puzzle {
  id: string; type: PuzzleType; flagOnSolve: string;
  // 화면 구성 데이터
  layout?: 'plan' | 'timeline' | 'lightbox' | 'connect' | 'logic';
  table?: { columns: string[]; rows: { id: string; cells: string[] }[] }; // logic: 후보 표
  statements?: string[];                                // logic: 대조에 쓰는 진술 ID
  title?: string; info?: string[]; tasks?: PuzzleTask[]; fixtures?: PuzzleBox[]; zones?: PuzzleBox[];
  tokens?: { id: string; label: string }[];            // timeline: 사건 카드
  boxes?: { id: string; label: string }[];             // timeline: 시간 칸 (id = 슬롯)
  panels?: { title: string; evidenceId?: string; lines?: string[] }[]; // evidenceId 로 원문(body)을 참조하거나, 단서가 아닌 문서는 lines
  subtitle?: string;       // lightbox: 겹쳐 보는 문서
  openWhen?: { flags?: string[]; evidence?: string[] }; // 자동으로 열리는 조건
  solvedDialogue?: string;                              // 해결 직후 독백 (중간 결론만)
  sourceEvidenceIds: string[]; verifiedEvidenceIds: string[];
  evidenceLinks?: Record<string, string[]>; // 슬롯 → 허용 근거(단서 ID 또는 진술 ID). 있으면 그 칸에 근거 카드를 붙여야 정답이다 (판정은 core/puzzle.ts)
  slots: string[]; correctSlots: Record<string, string[]>;
  distractors: string[]; conflicts: Record<string, string>; hintTexts: string[];
}
export interface LineWhen {
  solved?: string[]; notSolved?: string[]; anySolved?: string[]; secured?: boolean; external?: boolean;
}
export interface EndingLine { when: LineWhen; source: 'spec' | 'new'; text: string }
export interface Ending { id: string; title: string; card: string; finalDialogue?: string[][] }
export type EndingLineKey = 'haneul' | 'organization' | 'eunho';

export type StatementStage = 'unconfirmed' | 'contradiction' | 'revised';
export interface StatementRecord { text: string; speaker: string; stage: StatementStage; revisedText?: string }

export interface DialogueNode {
  speaker: string; portrait?: string; text: string;
  voice?: 'inner' | 'action'; // 소리 내어 하는 말이 아니다: inner = 생각·독백, action = 행동·소리 묘사. 화면에 ( ) 로 감싸 보여 준다 (괄호는 데이터에 쓰지 않는다)
  noPortrait?: boolean;       // 초상·실루엣을 아예 그리지 않는다 (노크 구간)
  source?: 'spec' | 'new' | 'craft_on'; // 기획서 문장이면 spec, 새로 쓴 문장이면 new
  next?: string;
  choices?: { text: string; next: string; requiresFlag?: string; requiresFlags?: string[]; hideIfFlag?: string }[];
  statement?: { id: string };   // 이 문장은 검증 대상 진술 (9.3)
  revises?: { id: string };     // 이 노드는 해당 진술의 정정 (text 가 새 문장)
  present?: { evidenceIds: string[]; next: string }[]; // 이 문장에만 제시 가능한 단서 (9.2)
  onEnter?: { acquire?: string[]; setFlags?: string[]; contradict?: string[]; preserve?: 'secure' | 'confront' }; // preserve: 씬 6 증거 보존 선택 // contradict: 미확인 진술을 모순 단계로
}
export interface Dialogue { start: string; then?: string; // then: 끝난 뒤 이어지는 장면 ('report' = 최종 보고서)
  restart?: { when: string; node: string }[]; nodes: Record<string, DialogueNode> } // restart: 조건(플래그 또는 evidence:ID)이 맞는 첫 항목의 노드에서 다시 시작
export type Dialogues = Record<string, Dialogue>;

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
  playerName: string;         // 새 게임에서 입력한 이름 (이어하기에서도 유지)
  visitedAreaIds: string[];
  playerX: number;            // 이어하기용 마지막 위치
  retryClaimIds: string[];    // 엔딩 D 재도전: 해결하지 못한 질문(관련 단서를 먼저 보여 준다)
  statements: Record<string, StatementRecord>;
  presentedKeys: string[];
}
