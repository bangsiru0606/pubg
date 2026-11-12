import { evidenceById } from './data';
import { acquireEvidence, chooseEvidencePreservation, isBasementOpen, setFlag } from './state';
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
  for (const id of node.onEnter?.contradict ?? []) { const st = s.statements[id]; if (st?.stage === 'unconfirmed') st.stage = 'contradiction'; }
  if (node.onEnter?.preserve) chooseEvidencePreservation(s, node.onEnter.preserve === 'secure');
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

/** 조건: 플래그 이름, 'evidence:ID'(획득), '@basement_open' */
export function condMet(s: GameState, cond: string): boolean {
  if (cond === '@basement_open') return isBasementOpen(s);
  if (cond.startsWith('evidence:')) return s.evidenceIds.includes(cond.slice(9));
  return s.flags.includes(cond);
}
/** 대화를 시작할 노드: restart 조건이 맞으면 그 노드, 아니면 처음 (반복 추궁해도 대화가 늘지 않게) */
export const startNodeOf = (s: GameState, d: Dialogue) => d.restart?.find((r) => condMet(s, r.when))?.node ?? d.start;

/** 다음 노드: nextIf 중 조건이 맞는 첫 항목, 없으면 next */
export const nextOf = (s: GameState, node: DialogueNode) => node.nextIf?.find((r) => r.flags.every((f) => s.flags.includes(f)))?.next ?? node.next;

/**
 * 대화를 여는 노드. 상태가 바뀌어 restart 노드가 달라졌으면 거기서, 이미 같은 상태에서 끝까지 본 대화면(새로 바뀐 것이 없다) 처음부터 다시 재생한다.
 * 대화를 닫을 때 markDialogueDone 이 '그때의 시작 노드'를 기록한다.
 */
export const doneKey = (dialogueId: string, nodeId: string) => `dlgdone:${dialogueId}:${nodeId}`;
export const openingNodeOf = (s: GameState, d: Dialogue, dialogueId: string) => { const n = startNodeOf(s, d); return s.flags.includes(doneKey(dialogueId, n)) ? d.start : n; };
export const markDialogueDone = (s: GameState, d: Dialogue, dialogueId: string) => setFlag(s, doneKey(dialogueId, startNodeOf(s, d)));

export const availableChoices = (s: GameState, node: DialogueNode) =>
  (node.choices ?? []).filter((c) => (!c.requiresFlag || s.flags.includes(c.requiresFlag)) && (c.requiresFlags ?? []).every((f) => s.flags.includes(f)) && !(c.hideIfFlag && s.flags.includes(c.hideIfFlag)));
