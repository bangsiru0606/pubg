// 씬 점프·시험용: "씬 N 을 시작하는 시점"의 상태를 정상 플레이와 같은 규칙으로 만든다 (순수 TS, Phaser·DOM 없음).
// 각 씬에서 거치는 조사 지점·대사 노드·퍼즐을 그대로 적용하므로, 단서 검증 상태·진술·플래그가 실제 플레이와 같다.
// 6단계 코어 테스트의 "모든 조사 지점과 대사를 거친 상태"도 이 함수(buildProgress(7))를 쓴다.
import real from '../data/dialogue.json';
import { acquireEvidence, createGameState, enterNode, presentEvidence, puzzles, wrongAnswerOf, setFlag, submitPuzzle, type Dialogues, type GameState } from '../core';
import { areas } from './interaction';

const D = real.dialogues as unknown as Dialogues;

interface SceneSteps { dialogues?: string[]; examines?: [string, string][]; puzzles?: string[]; flags?: string[] }
/** 씬별로 끝내는 일 (씬 1 = 인덱스 0). 씬 6 은 증거 보존 선택에 따라 따로 처리한다. */
export const SCENE_STEPS: SceneSteps[] = [
  { dialogues: ['eunho_intro'], flags: ['cutscene_done:hospital_intro'] },
  { dialogues: ['baek_lobby'], examines: [['floor1', 'exam_note'], ['room_director', 'altar'], ['room_director', 'under_desk'], ['room_director', 'chair']], puzzles: ['P01_scene_rebuild'] },
  { dialogues: ['choi_okja', 'han_yujin', 'chae_soyeon', 'jeong_haneul'], examines: [['floor2', 'broadcast']] }, // P02 는 간호사실에서 E05 를 얻은 뒤(씬 4)에 열린다
  { dialogues: ['baek_office', 'oh_miran', 'lee_hyejeong'], examines: [['room_baek', 'revision'], ['room_oh', 'stock'], ['room_lee', 'desk']], puzzles: ['P02_night_timeline', 'P03_revision_diff', 'P04_approval_chain'], flags: ['basement_announced'] },
  { dialogues: ['jeong_haneul_final'], examines: [['b1', 'ledger'], ['b1', 'idmap'], ['b1', 'manifest'], ['b1', 'belongings']], puzzles: ['P05_patient_code'], flags: ['diary_closed'] },
];

/** 씬 N(1~7) 시작 지점: 위치(구역·x)와 그 시점까지의 상태. 씬 7 = 증거 보존 선택까지 끝나고 최종 보고서를 여는 시점. */
export const SCENE_START: { area: string; x: number }[] = [
  { area: 'office', x: 180 }, { area: 'floor1', x: 0 }, { area: 'floor2', x: 50 }, { area: 'floor3', x: 50 }, { area: 'b1', x: 50 }, { area: 'b1', x: 50 }, { area: 'b1', x: 50 },
];

function applyExamine(s: GameState, areaId: string, id: string) {
  const it = areas[areaId].interactables.find((i) => i.id === id);
  if (!it || it.type !== 'examine') throw new Error(`examine ${areaId}/${id} 없음`);
  if (it.dialogueId) for (const n of Object.values(D[it.dialogueId].nodes)) enterNode(s, n);
  for (const e of [...(it.evidenceId ? [it.evidenceId] : []), ...(it.evidenceIds ?? [])]) acquireEvidence(s, e);
}

/** 씬 `scene` 에서 거치는 대사·조사·퍼즐을 적용한다. opts.puzzles=false 면 퍼즐은 풀지 않는다 (퍼즐이 열리기 직전 상태: 화면 확인·근거 점검용). */
/** 틀린 답으로 한 번 확정한다 = 틀리게 정리 (F9·시험용). 칸은 모두 채우되 정답이 아닌 값을 넣는다. */
export function failPuzzle(s: GameState, id: string) {
  const p = puzzles.find((q) => q.id === id)!;
  submitPuzzle(s, id, wrongAnswerOf(p));
}

export function applyScene(s: GameState, scene: number, secure = true, opts: { puzzles?: boolean; fail?: string[] } = {}) {
  if (scene === 6) { // 씬 6: 증거 보존 선택
    enterNode(s, D.eunho_message.nodes.m1);
    enterNode(s, D.eunho_message.nodes[secure ? 'a1' : 'b1']);
    return;
  }
  const st = SCENE_STEPS[scene - 1];
  for (const d of st.dialogues ?? []) {
    for (const n of Object.values(D[d].nodes)) enterNode(s, n);
    // 철저한 플레이어처럼: 가진 단서로 제시할 수 있는 규칙은 제시한다 (진술이 모순 단계로 바뀐다)
    for (const [nodeId, n] of Object.entries(D[d].nodes))
      for (const r of n.present ?? []) if (r.evidenceIds.every((id) => s.evidenceIds.includes(id))) presentEvidence(s, D[d], d, nodeId, r.evidenceIds);
  }
  for (const [a, id] of st.examines ?? []) applyExamine(s, a, id);
  for (const f of st.flags ?? []) setFlag(s, f);
  if (opts.puzzles !== false) for (const id of st.puzzles ?? []) { const p = puzzles.find((q) => q.id === id)!; if (opts.fail?.includes(id)) failPuzzle(s, id); else submitPuzzle(s, id, p.correctSlots); } // 조각을 정답 칸에 놓은 상태 (fail: 틀리게 정리한 상태)
}

/** 씬 `scene`(1~7)을 시작하는 시점의 상태. 앞선 씬을 모두 거친 것으로 만든다. */
export function buildProgress(scene: number, opts: { secure?: boolean; name?: string; puzzles?: boolean; fail?: string[] } = {}): { state: GameState; area: string; x: number } {
  const state = createGameState();
  if (opts.name) state.playerName = opts.name;
  for (let k = 1; k < scene; k++) applyScene(state, k, opts.secure ?? true, { puzzles: opts.puzzles, fail: opts.fail }); // puzzles:false = 퍼즐을 하나도 풀지 않은 플레이
  const at = SCENE_START[scene - 1];
  state.currentSceneId = at.area; state.playerX = at.x;
  if (scene > 1) for (const a of ['office', 'floor1']) if (!state.visitedAreaIds.includes(a)) state.visitedAreaIds.push(a);
  return { state, ...at };
}
