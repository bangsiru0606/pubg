// 탐색 규칙(순수 TS, Phaser·DOM 없음): 구역 데이터, 가장 가까운 대상 1개, 잠금 조건, 자동 트리거.
import map from '../data/map.json';
import spec from '../../art/asset-spec.json';
import { hasFlag, isBasementOpen, type GameState } from '../core';

interface Gate { requires?: string; requiresEvidence?: string[]; hideWhen?: string }
export interface Transition extends Gate { type: 'transition'; id: string; x: number; label: string; to: string; spawnX: number; kind: 'door' | 'stairs'; lockedDialogue?: string; cutscene?: string }
export interface Npc extends Gate { type: 'npc'; id: string; x: number; name: string; dialogueId: string; autoTrigger?: { x: number; width: number } }
export interface Examine extends Gate { type: 'examine'; id: string; x: number; name: string; evidenceId?: string; closeup?: string; dialogueId?: string; puzzleId?: string }
export type Interactable = Transition | Npc | Examine;
export interface Prop { id: string; x: number; w: number; h: number; color: string; label: string; showWhen?: string }
export interface AreaDef {
  name: string; theme: string; minX: number; maxX: number;
  objects?: { id: string; tex: string; x: number; bottom: number }[];
  interactables: Interactable[]; props?: Prop[]; npcSprite?: Record<string, string>; npcFacing?: Record<string, 'left' | 'right'>;
}

export const GROUND_Y = map.groundY;
export const PLAYER_SPEED = map.playerSpeed;
export const RUN_MULTIPLIER = map.runMultiplier;
export const INTERACT_RANGE = map.interactRange;
export const START = { area: map.startArea, x: map.startX };
export const themes = map.themes as Record<string, { wall: string; floor: string }>;
export const areas = map.areas as unknown as Record<string, AreaDef>;

/** 잠금 조건: 플래그 이름, 또는 '@basement_open'(P03+P04 해결) */
export function isAvailable(it: Interactable, s: GameState): boolean {
  if (it.requiresEvidence?.some((id) => !s.evidenceIds.includes(id))) return false;
  if (!it.requires) return true;
  return it.requires === '@basement_open' ? isBasementOpen(s) : hasFlag(s, it.requires);
}
/** 이미 사라진 대상(예: 자리를 뜬 NPC) */
export const isHidden = (it: Interactable, s: GameState) => !!it.hideWhen && hasFlag(s, it.hideWhen);

/** 프롬프트 문구 (craft_on 규칙: NPC 대화하기, 조사 조사하기, 문/계단은 라벨 그대로) */
export function promptOf(it: Interactable): { label: string; action: string } {
  if (it.type === 'npc') return { label: it.name, action: '대화하기' };
  if (it.type === 'examine') return { label: it.name, action: '조사하기' };
  return { label: it.label, action: it.kind === 'stairs' ? '이동하기' : '들어가기' };
}

/** 가장 가까운 대상 1개 (범위 안). 사용 불가(잠김)면 null — 프롬프트도 뜨지 않는다. */
export function nearest(area: AreaDef, x: number, s: GameState, range = INTERACT_RANGE): Interactable | null {
  let best: Interactable | null = null, bd = Infinity;
  for (const it of area.interactables) {
    const d = Math.abs(it.x - x);
    if (d <= range && d < bd && !isHidden(it, s)) { best = it; bd = d; }
  }
  // 잠겨 있어도 이유 독백(lockedDialogue)이 있는 전환은 프롬프트를 띄운다
  return best && (isAvailable(best, s) || (best.type === 'transition' && !!best.lockedDialogue)) ? best : null;
}

/** 자동 트리거 구역: 한 번만 발동 */
export const triggerKey = (areaId: string, npcId: string) => `trigger_fired:${areaId}:${npcId}`;
export function autoTriggered(areaId: string, area: AreaDef, x: number, s: GameState): Npc | null {
  for (const it of area.interactables)
    if (it.type === 'npc' && it.autoTrigger && !isHidden(it, s) && !hasFlag(s, triggerKey(areaId, it.id)) &&
        Math.abs(x - it.autoTrigger.x) <= it.autoTrigger.width / 2) return it;
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
