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
  claimId: string; question: string; stem?: string; requiredDistinctSourceTypes: number; // stem: 보고서의 문장 빈칸 ({} 자리에 가설 문장이 들어간다)
  requiresFlag?: string; hypotheses: Hypothesis[];
  relatedEvidenceIds: string[]; // 엔딩 D 재도전에서 "관련" 으로 먼저 보여 줄 단서 (그 질문을 다루는 장면에서 얻는 것, 정답 근거만이 아니다)
}
export type PuzzleType = 'SpatialPlacement' | 'Timeline' | 'DocumentDiff' | 'Connection' | 'LogicGrid';
export interface PuzzleTask { slot: string; label: string; token?: string; detail?: string; kind: 'place' | 'mark'; options: { id: string; label: string }[]; single?: boolean; form?: string; formSource?: string } // single: 하나만 고르는 표시(desktop), form·formSource: 트리 칸의 서식 문구와 그 출처
export interface PuzzleBox { id: string; label: string; sub?: string; x: number; y: number; w: number; h: number } // 평면도 좌표(%)
/** 퍼즐 조각: label 은 source(단서·진술 ID, 또는 dialogue:<대화>:<노드>)의 원문에 실제로 있는 문장이다. need: 그 플래그가 서야 나타난다(대화 출처). decoy: 어느 칸에도 놓지 않는 오답 조각 */
export interface PuzzlePiece { id: string; label: string; source: string; srcName?: string; need?: string; decoy?: boolean } // srcName: 단서·진술이 아닌 출처(대화 독백)의 표시 이름
/** P03 부원장 PC 바탕화면: 파일(문서·수정 이력)·휴지통 안의 이전 판·문서 비교 프로그램 */
export interface PuzzleDesktop {
  files: { id: string; name: string; evidenceId?: string; lines?: string[]; inTrash?: boolean }[];
  trashName: string; compareName: string;
  diffs: { id: string; before: string; after: string }[]; // 비교하면 표시되는 바뀐 줄 (의미 없는 변경은 넣지 않는다)
}
/** P01 추리 문답: 질문 노드마다 선택지(판단 + 이유). 답에 따라 다음 질문이 달라진다. next 가 없는 선택지가 마지막 판단이다. 결론 문장 = subject + 지나온 선택지의 says 를 이은 것. quote: source(단서·진술 ID) 원문에 실제 있는 문장 */
export interface QuizChoice { id: string; judge: string; reason: string; source: string; srcName?: string; quote: string; short: string; says: string; next?: string }
export interface PuzzleQuiz { start: string; subject: string; nodes: Record<string, { q: string; choices: QuizChoice[] }> }
export interface Puzzle {
  id: string; type: PuzzleType; flagOnSolve: string;
  // 화면 구성 데이터
  quiz?: PuzzleQuiz;                                    // quiz: 추리 문답 (답 = path 칸에 지나온 선택지 ID 들)
  layout?: 'plan' | 'timeline' | 'desktop' | 'tree' | 'logic' | 'quiz';
  table?: { columns: string[]; rows: { id: string; cells: string[] }[] }; // logic: 후보 표
  statements?: string[];                                // logic: 대조에 쓰는 진술 ID
  title?: string; info?: string[]; tasks?: PuzzleTask[]; fixtures?: PuzzleBox[]; zones?: PuzzleBox[];
  tokens?: PuzzlePiece[];                              // plan·timeline: 퍼즐 조각 = 단서의 핵심 문장(인용). 출처(source)는 단서·진술 ID
  people?: { id: string; label: string; decoy?: boolean }[]; // tree: 인물 카드 (칸마다 같은 카드를 놓을 수 있다)
  desktop?: PuzzleDesktop;                              // desktop: 부원장 PC 바탕화면
  boxes?: { id: string; label: string }[];             // timeline: 시간 칸 (id = 슬롯)
  subtitle?: string;       // lightbox: 겹쳐 보는 문서
  openWhen?: { flags?: string[]; evidence?: string[] }; // 자동으로 열리는 조건
  sourceEvidenceIds: string[]; verifiedEvidenceIds: string[];
  slots: string[]; correctSlots: Record<string, string[]>;

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
  voice?: 'inner' | 'action' | 'message'; // 소리 내어 하는 말이 아니다: inner = 생각·독백, action = 행동·소리 묘사, message = 받은 메시지(회상 띠로 보여 준다, 괄호 없음). 화면에 ( ) 로 감싸 보여 준다 (괄호는 데이터에 쓰지 않는다)
  noPortrait?: boolean;       // 초상·실루엣을 아예 그리지 않는다 (노크 구간)
  source?: 'spec' | 'new' | 'craft_on'; // 기획서 문장이면 spec, 새로 쓴 문장이면 new
  next?: string;
  nextIf?: { flags: string[]; next: string }[]; // 이 노드의 효과(플래그)까지 적용한 뒤 flags 가 모두 서 있으면 next 대신 그 노드로 간다 (선택지를 모두 물은 뒤 자연스럽게 이어지게)
  choices?: { text: string; next: string; requiresFlag?: string; requiresFlags?: string[]; hideIfFlag?: string }[];
  statement?: { id: string; text?: string };   // 이 문장은 검증 대상 진술 (9.3). text: 진술 카드에 적을 문장 (생략하면 이 노드의 문장). 한 진술이 두 대사에 걸칠 때 쓴다
  revises?: { id: string };     // 이 노드는 해당 진술의 정정 (text 가 새 문장)
  present?: { evidenceIds: string[]; next: string }[]; // 이 문장에만 제시 가능한 단서 (9.2)
  onEnter?: { acquire?: string[]; setFlags?: string[]; contradict?: string[]; preserve?: 'secure' | 'confront' }; // preserve: 씬 6 증거 보존 선택 // contradict: 미확인 진술을 모순 단계로
}
export interface Dialogue { start: string; then?: string; // then: 끝난 뒤 이어지는 장면 ('report' = 최종 보고서)
  restart?: { when: string; node: string; keep?: boolean }[]; // 조건(플래그 또는 evidence:ID, & 로 여러 개)이 맞는 첫 항목의 노드에서 다시 시작. keep: 같은 상태에서도 처음부터 재생하지 않고 항상 그 노드에서 시작(그 노드에서 단서 제시로 이야기가 이어질 때)
  nodes: Record<string, DialogueNode> }
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
  hintCountByPuzzle: Record<string, number>; // 쓰지 않는다 (힌트 없음). 저장 호환용으로 남겨 둔다
  failedPuzzleIds: string[];                  // 틀리게 정리한 퍼즐 (한 번 확정하면 바꿀 수 없다. 화면에는 "정리함"으로만 보인다)
  puzzleDrafts: Record<string, Record<string, string[]>>; // 보류하고 나간 퍼즐의 놓은 조각
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
