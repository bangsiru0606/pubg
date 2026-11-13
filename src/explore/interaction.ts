// 탐색 규칙(순수 TS, Phaser·DOM 없음): 구역 데이터, 가장 가까운 대상 1개, 잠금 조건, 자동 트리거.
import map from '../data/map.json';
import spec from '../../art/asset-spec.json';
import { condMet, hasFlag, type GameState } from '../core';

interface Gate { requires?: string; requiresEvidence?: string[]; hideWhen?: string; showWhen?: string }
export interface Transition extends Gate { type: 'transition'; id: string; x: number; label: string; to: string; spawnX: number; kind: 'door' | 'stairs'; lockedDialogue?: string; cutscene?: string; cutsceneDialogue?: string; art?: string; artLocked?: string; flipArt?: boolean; auto?: boolean; sfx?: string; lockedSfx?: string }
export interface Npc extends Gate { type: 'npc'; id: string; x: number; name: string; dialogueId: string; autoTrigger?: { x: number; width: number }; autoWhen?: string[]; silent?: boolean; inertWhen?: string; introScene?: string } // autoWhen: 모든 플래그가 서면 한 번 자동 시작, silent: 그림·프롬프트 없는 장면 사건, introScene: 자동 시작 때 대화 대신 구역의 scenes.<이름> 연출을 재생(NPC 는 연출이 등장시킬 때까지 숨어 있다), inertWhen: 이 플래그가 서면 그림은 남지만 말을 걸 수 없다
export interface Examine extends Gate { type: 'examine'; id: string; x: number; name: string; evidenceId?: string; closeup?: string; dialogueId?: string; puzzleId?: string; evidenceIds?: string[]; art?: string; artBottom?: number; artFallback?: { art: string; base?: string; artBottom?: number }; docId?: string; thoughtId?: string; sparkle?: boolean; doneFlag?: string } // docId: 단서가 아닌 맥락 문서(src/data/documents.json)를 보여 준다(교리 액자·감사패 등). thoughtId: 문서를 읽은 뒤 한 번 나오는 플레이어 독백. artFallback: art 그림이 아직 없을 때 대신 그리는 기존 그림(base 는 그 밑에 깔 소품)
export type Interactable = Transition | Npc | Examine;
export interface Prop { id: string; x: number; w: number; h: number; color: string; label: string; showWhen?: string; tex?: string }
export interface OpeningStep { do: 'dialogue' | 'camera' | 'appear' | 'hide' | 'face' | 'wait' | 'walk' | 'refresh' | 'unlock' | 'hints' | 'sfx' | 'place'; x?: number; times?: number; every?: number; edge?: 'left' | 'right'; offset?: number; id?: string; docs?: boolean; to?: string; smooth?: number; settle?: boolean; actor?: string; dir?: 'left' | 'right'; sec?: number; gap?: number; toX?: number; speed?: number; texts?: string[] }
export interface Opening { closeup: string; actors: Record<string, { sprite: string; x: number; facing: 'left' | 'right' }>; steps: OpeningStep[] }
export interface AreaDef {
  name: string; theme: string; minX: number; maxX: number; bg?: { wall: string; floor: string; topband?: string; wallOffsetY?: number }; // wallOffsetY: 벽 그림을 아래로 내리는 px (난간을 허리 높이로). 원본·정규화 결과는 그대로, 내려간 아래쪽은 바닥이 덮는다
  objects?: { id: string; tex: string; x: number; bottom: number }[];
  walk?: { min: number; max: number }; // 플레이어가 갈 수 있는 범위 (계단·문 앞). minX/maxX 는 벽·바닥을 그리는 범위, 그 밖은 검은색
  scenes?: Record<string, OpeningStep[]>; // 이름 붙은 연출 (NPC 의 introScene)
  stage?: { flag: string; steps: OpeningStep[] }; // 처음 들어왔을 때의 연출 (flag 가 서 있으면 재생하지 않는다)
  interactables: Interactable[]; props?: Prop[]; npcSprite?: Record<string, string>; npcFacing?: Record<string, 'left' | 'right'>;
}

export const GROUND_Y = map.groundY;
export const PLAYER_SPEED = map.playerSpeed;
export const RUN_MULTIPLIER = map.runMultiplier;
export const INTERACT_RANGE = map.interactRange;
export const START = { area: map.startArea, x: map.startX };
export const OPENING = map.opening as unknown as Opening;
export const themes = map.themes as Record<string, { wall: string; floor: string }>;
export const areas = map.areas as unknown as Record<string, AreaDef>;

/** 잠금 조건: 플래그 이름, 또는 '@basement_open'(P03+P04 해결) */
export function isAvailable(it: Interactable, s: GameState): boolean {
  if (it.requiresEvidence?.some((id) => !s.evidenceIds.includes(id))) return false;
  return !it.requires || condMet(s, it.requires);
}
/** 조사 지점을 이미 조사했는가: 단서는 모두 얻었고, 퍼즐이 딸려 있으면 한 번 열었거나 풀었다. 반짝임 표시는 조사 전에만 띄운다. */
export function isExamined(it: Examine, s: GameState): boolean {
  if (it.doneFlag) return hasFlag(s, it.doneFlag); // 단서 없이 독백·관찰만 있는 지점: 그 독백을 한 번 보면 조사를 마친 것
  const ids = [...(it.evidenceId ? [it.evidenceId] : []), ...(it.evidenceIds ?? [])];
  if (ids.some((id) => !s.evidenceIds.includes(id))) return false;
  if (it.puzzleId) return s.solvedPuzzleIds.includes(it.puzzleId) || hasFlag(s, `puzzle_opened:${it.puzzleId}`);
  return true;
}
/** 반짝임을 띄울 지점: 조사 전이고 지금 조사할 수 있는 examine (map.json 의 sparkle: false 로 끈다, 근접 조사 지점은 제외) */
export const showsSparkle = (it: Interactable, s: GameState) => it.type === 'examine' && it.sparkle !== false && !it.closeup && isAvailable(it, s) && !isHidden(it, s) && !isExamined(it, s);
/** 이미 사라진 대상(예: 자리를 뜬 NPC) */
export const isHidden = (it: Interactable, s: GameState) => (!!it.hideWhen && hasFlag(s, it.hideWhen)) || (!!it.showWhen && !hasFlag(s, it.showWhen)) || (it.type === 'npc' && !!it.silent);

/** 프롬프트 문구 (craft_on 규칙: NPC 대화하기, 조사 조사하기, 문/계단은 라벨 그대로) */
export function promptOf(it: Interactable): { label: string; action: string } {
  if (it.type === 'npc') return { label: it.name, action: '대화하기' };
  if (it.type === 'examine') return { label: it.name, action: '조사하기' };
  return { label: it.label, action: it.label.includes('나가기') ? '나가기' : it.kind === 'stairs' ? '이동하기' : '들어가기' };
}

/** 가장 가까운 대상 1개 (범위 안). 사용 불가(잠김)면 null — 프롬프트도 뜨지 않는다. */
export function nearest(area: AreaDef, x: number, s: GameState, range = INTERACT_RANGE): Interactable | null {
  let best: Interactable | null = null, bd = Infinity;
  for (const it of area.interactables) {
    if (it.type === 'npc' && it.inertWhen && hasFlag(s, it.inertWhen)) continue; // 장면 중 서 있기만 하는 NPC
    const d = Math.abs(it.x - x);
    if (d <= range && d < bd && !isHidden(it, s)) { best = it; bd = d; }
  }
  // 잠겨 있어도 이유 독백(lockedDialogue)이 있는 전환은 프롬프트를 띄운다
  return best && (isAvailable(best, s) || (best.type === 'transition' && !!best.lockedDialogue)) ? best : null;
}

/** 자동 트리거 구역: 한 번만 발동 */
export const triggerKey = (areaId: string, npcId: string) => `trigger_fired:${areaId}:${npcId}`;
export function autoTriggered(areaId: string, area: AreaDef, x: number, s: GameState): Npc | null {
  for (const it of area.interactables) {
    if (it.type !== 'npc' || hasFlag(s, triggerKey(areaId, it.id)) || (it.inertWhen && hasFlag(s, it.inertWhen))) continue;
    if (it.autoWhen && it.autoWhen.every((f) => hasFlag(s, f)) && !(it.hideWhen && hasFlag(s, it.hideWhen))) return it;
    if (it.autoTrigger && !isHidden(it, s) && Math.abs(x - it.autoTrigger.x) <= it.autoTrigger.width / 2) return it;
  }
  return null;
}

/** 대화 시작 시 서는 위치: 상대와 최소 TALK_DISTANCE 를 두고, 플레이어가 있던 쪽(겹쳤으면 왼쪽)에 선다. 맵 끝이면 반대쪽. */
export const TALK_DISTANCE = 56; // 캐릭터 폭 53px 이므로 중심 간격 56px
const facingOf = Object.fromEntries((spec.sequences as { id: string; facing: 'left' | 'right' }[]).map((q) => [q.id, q.facing]));
/** 원본 그림이 바라보는 방향(asset-spec facing)을 고려해, 원하는 방향을 보게 하는 flipX 값. 플레이어·NPC 모두 이 함수만 쓴다. */
export function flipFor(spriteId: string, wantLeft: boolean): boolean {
  const f = facingOf[spriteId];
  if (!f) throw new Error(`asset-spec 에 facing 이 없는 스프라이트: ${spriteId}`);
  return wantLeft ? f === 'right' : f === 'left';
}
/** 걷는 방향(출발 x → 도착 x)에서 몸 방향을 정한다. 걷기는 항상 이것만 쓰고, 데이터의 facing 값은 멈춰 있을 때만 쓴다. */
export const walkFlip = (spriteId: string, fromX: number, toX: number): boolean => flipFor(spriteId, toX < fromX);
/** flipX 값으로 실제 바라보는 방향 계산 (테스트·검증용) */
export const facesLeft = (spriteId: string, flipX: boolean) => (facingOf[spriteId] === 'left') !== flipX;
export function talkStand(playerX: number, npcX: number, minX: number, maxX: number): { x: number; playerFacesLeft: boolean } {
  let side = playerX > npcX ? 1 : -1;
  if (npcX + side * TALK_DISTANCE < minX || npcX + side * TALK_DISTANCE > maxX) side = -side;
  return { x: npcX + side * TALK_DISTANCE, playerFacesLeft: side > 0 };
}

/** 전환 페이드(초). 이미 방문한 구역은 왕복 합계 0.4초 이하 (보정판 8.2) */
export function fadeSeconds(visited: boolean): { out: number; in: number } {
  return visited ? { out: 0.18, in: 0.18 } : { out: 0.3, in: 0.3 };
}
