import { evidenceById } from './data';
import { acquireEvidence, setFlag } from './state';
import type { Dialogue, DialogueNode, Dialogues, GameState } from './types';

export const MSG_NO_CONFLICT = '이 자료는 지금 발언과 직접 충돌하지 않는다.';
export const MSG_REPEAT = '같은 모순은 반복해서 제시할 수 없다.';

export type PresentResult =
  | { kind: 'ok'; next: string }
  | { kind: 'none' | 'repeat'; message: string };

export function getNode(dialogues: Dialogues, id: string, nodeId: string): DialogueNode {
  const node = dialogues[id]?.nodes[nodeId];
  if (!node) throw new Error(`dialogue ${id}/${nodeId} not found`);
  return node;
}

/** 노드 진입 효과: 단서·플래그, 진술 등록(9.3). 한 노드에 한 번만 호출한다. */
export function enterNode(s: GameState, node: DialogueNode): { acquired: string[] } {
  const acquired: string[] = [];
  if (node.statement && !s.statements[node.statement.id])
    s.statements[node.statement.id] = { text: node.text, speaker: node.speaker, stage: 'unconfirmed' };
  if (node.revises) {
    const st = s.statements[node.revises.id];
    if (st) { st.stage = 'revised'; st.revisedText = node.text; }
  }
  for (const id of node.onEnter?.acquire ?? []) if (acquireEvidence(s, id)) acquired.push(id);
  for (const f of node.onEnter?.setFlags ?? []) setFlag(s, f);
  return { acquired };
}

const setKey = (ids: string[]) => [...ids].sort().join('+');

/**
 * 단서 제시 (9.2): 노드의 present 규칙에만 반응한다. 관련 없는 단서는 중립 메시지만, 벌점·진행 차단 없음.
 * 같은 모순은 반복 제시 불가. 진술을 정정시키는 노드로 가는 규칙은 물증/기록이 하나 이상 있어야 열린다.
 */
export function presentEvidence(s: GameState, d: Dialogue, dialogueId: string, nodeId: string, ids: string[]): PresentResult {
  const node = d.nodes[nodeId];
  const sel = setKey(ids);
  const rule = node.present?.find((r) => setKey(r.evidenceIds) === sel);
  if (!rule) return { kind: 'none', message: MSG_NO_CONFLICT };
  const needsHard = !!d.nodes[rule.next]?.revises;
  const hasHard = ids.some((id) => ['physical', 'record'].includes(evidenceById.get(id)?.sourceType ?? ''));
  if (needsHard && !hasHard) return { kind: 'none', message: MSG_NO_CONFLICT };
  const key = `${dialogueId}:${nodeId}:${sel}`;
  if (s.presentedKeys.includes(key)) return { kind: 'repeat', message: MSG_REPEAT };
  s.presentedKeys.push(key);
  if (node.statement && s.statements[node.statement.id]?.stage === 'unconfirmed') s.statements[node.statement.id].stage = 'contradiction';
  return { kind: 'ok', next: rule.next };
}

export const availableChoices = (s: GameState, node: DialogueNode) =>
  (node.choices ?? []).filter((c) => !c.requiresFlag || s.flags.includes(c.requiresFlag));
