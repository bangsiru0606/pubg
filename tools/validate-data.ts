// 데이터 ID 참조 무결성 검사: npm run validate
import { existsSync } from 'node:fs';
import real from '../src/data/dialogue.json' with { type: 'json' };
import fixture from '../src/data/dialogue.test-fixture.json' with { type: 'json' };
import { areas } from '../src/explore/interaction';
import { characters, claims, conflictPairs, endingLines, endings, evidenceById, evidenceList, puzzles } from '../src/core/data';
import type { Dialogue } from '../src/core/types';

const errors: string[] = [];
const err = (m: string) => errors.push(m);
const TYPES = ['physical', 'record', 'testimony', 'context'];
const PUZZLE_TYPES = ['SpatialPlacement', 'Timeline', 'DocumentDiff', 'Connection', 'LogicGrid'];
const dup = (ids: string[], what: string) => ids.forEach((id, i) => ids.indexOf(id) !== i && err(`${what} 중복 id: ${id}`));

// map / dialogue
const dialogueIds = new Set([...Object.keys(real.dialogues), ...Object.keys(fixture.dialogues)]);
const knownFlags = new Set<string>(['@basement_open', ...puzzles.map((p) => p.flagOnSolve)]);
for (const d of [...Object.values(real.dialogues), ...Object.values(fixture.dialogues)] as unknown as Dialogue[])
  for (const n of Object.values(d.nodes)) for (const f of n.onEnter?.setFlags ?? []) knownFlags.add(f);
const needEvLater: [string, string][] = [];
for (const [aid, a] of Object.entries(areas)) {
  const where = `map/${aid}`;
  if (a.minX >= a.maxX) err(`${where}: 범위 이상`);
  for (const o of a.objects ?? []) if (!existsSync(`public/assets/${o.tex}.png`)) err(`${where}: 누락 에셋 ${o.tex}`);
  for (const it of a.interactables) {
    const w = `${where}/${it.id}`;
    if (it.x < a.minX || it.x > a.maxX) err(`${w}: 구역 밖`);
    if (it.type === 'transition') {
      const t = areas[it.to];
      if (!t) { err(`${w}: 없는 구역 ${it.to}`); continue; }
      if (it.spawnX < t.minX || it.spawnX > t.maxX) err(`${w}: spawnX 가 ${it.to} 범위 밖`);
      if (it.cutscene && !existsSync(`public/assets/illust/${it.cutscene}.png`)) err(`${w}: 없는 컷신 ${it.cutscene}`);
    }
    if (it.requires && !knownFlags.has(it.requires)) err(`${w}: 어디서도 설정되지 않는 플래그 ${it.requires}`);
    if (it.hideWhen && !knownFlags.has(it.hideWhen)) err(`${w}: 어디서도 설정되지 않는 플래그 ${it.hideWhen}`);
    for (const id of it.requiresEvidence ?? []) needEvLater.push([id, w]);
    const dlg = it.type === 'transition' ? it.lockedDialogue : it.type === 'examine' ? it.dialogueId : undefined;
    if (dlg && !dialogueIds.has(dlg)) err(`${w}: 없는 대사 ${dlg}`);
    if (it.type === 'examine') {
      if (it.evidenceId) needEvLater.push([it.evidenceId, w]);
      if (it.puzzleId && !puzzles.some((p) => p.id === it.puzzleId)) err(`${w}: 없는 퍼즐 ${it.puzzleId}`);
    }
  }
}
const charIds = new Set(characters.map((c) => c.id));
for (const c of characters) if (c.portrait && !existsSync(`public/assets/illust/${c.portrait}_neutral.png`)) err(`characters/${c.id}: 초상 ${c.portrait} 없음`);
for (const [did, d] of Object.entries({ ...real.dialogues, ...fixture.dialogues }) as [string, Dialogue][]) {
  if (!d.nodes[d.start]) err(`dialogue ${did}: start 노드 없음`);
  for (const r of d.restart ?? []) if (!d.nodes[r.node]) err(`dialogue ${did}: restart 노드 없음 ${r.node}`);
  for (const [nid, n] of Object.entries(d.nodes)) {
    const w = `dialogue ${did}/${nid}`;
    if (real.dialogues[did as keyof typeof real.dialogues] && n.source !== 'spec' && n.source !== 'new') err(`${w}: source(spec|new) 표시 없음`);
    if (!charIds.has(n.speaker)) err(`${w}: 없는 인물 ${n.speaker}`);
    if (n.portrait && !existsSync(`public/assets/illust/${n.portrait}.png`)) err(`${w}: 없는 초상 ${n.portrait}`);
    const refs = [n.next, ...(n.choices ?? []).map((c) => c.next), ...(n.present ?? []).map((p) => p.next)].filter(Boolean) as string[];
    for (const c of n.onEnter?.contradict ?? []) if (!Object.values(real.dialogues).some((dd) => Object.values((dd as unknown as Dialogue).nodes).some((x) => x.statement?.id === c))) err(`${w}: 없는 진술 ${c}`);
    for (const r of refs) if (!d.nodes[r]) err(`${w}: 없는 노드 ${r}`);
    for (const id of [...(n.onEnter?.acquire ?? []), ...(n.present ?? []).flatMap((p) => p.evidenceIds)]) needEvLater.push([id, w]);
  }
}
// 지도의 NPC 대사 중 아직 없는 것은 허용(4단계에서 작성)
const missing = Object.values(areas).flatMap((a) => a.interactables).filter((i) => i.type === 'npc' && !dialogueIds.has(i.dialogueId)).length;

// asset-spec: 모든 sequence 에 facing 필수
import spec from '../art/asset-spec.json' with { type: 'json' };
for (const q of spec.sequences as { id: string; facing?: string }[]) if (q.facing !== 'left' && q.facing !== 'right') err(`asset-spec sequence ${q.id}: facing(left|right) 누락`);
for (const a of Object.values(areas)) for (const sp of Object.values(a.npcSprite ?? {})) if (!(spec.sequences as { id: string }[]).some((q) => q.id === sp)) err(`map: npcSprite ${sp} 가 asset-spec 에 없음`);

// evidence
dup(evidenceList.map((e) => e.id), 'evidence');
for (const e of evidenceList) if (!TYPES.includes(e.sourceType)) err(`${e.id}: sourceType ${e.sourceType}`);
const needEv = (id: string, where: string) => { if (!evidenceById.has(id)) err(`${where}: 없는 단서 ${id}`); };

needEvLater.forEach(([id, w]) => needEv(id, w));
for (const e of evidenceList) if (e.sourceCharacterId && !charIds.has(e.sourceCharacterId)) err(`${e.id}: 없는 인물 ${e.sourceCharacterId}`);
for (const e of evidenceList) for (const l of e.newText ?? []) if (!e.body?.includes(l)) err(`${e.id}: newText 가 body 에 없음`);
for (const e of evidenceList) if (e.illust && !existsSync(`public/assets/illust/${e.illust}.png`)) err(`${e.id}: 없는 일러스트 ${e.illust}`);
for (const [a, b] of conflictPairs) { needEv(a, 'conflicts'); needEv(b, 'conflicts'); }

// puzzles
dup(puzzles.map((p) => p.id), 'puzzle');
const flagsSetByPuzzles = new Set(puzzles.map((p) => p.flagOnSolve));
const verifiers = new Map<string, string>();
for (const p of puzzles) {
  if (!PUZZLE_TYPES.includes(p.type)) err(`${p.id}: type ${p.type}`);
  [...p.sourceEvidenceIds, ...p.verifiedEvidenceIds].forEach((id) => needEv(id, p.id));
  for (const id of p.verifiedEvidenceIds) {
    if (verifiers.has(id)) err(`${id}: 검증 퍼즐이 둘 (${verifiers.get(id)}, ${p.id})`);
    verifiers.set(id, p.id);
    if (evidenceById.get(id)?.sourceType === 'context') err(`${p.id}: context 단서 ${id} 를 검증 대상으로 지정`);
  }
  for (const s of p.slots) if (!p.correctSlots[s]?.length) err(`${p.id}: 슬롯 ${s} 정답 없음`);
  for (const s of Object.keys(p.correctSlots)) if (!p.slots.includes(s)) err(`${p.id}: correctSlots 의 알 수 없는 슬롯 ${s}`);
  for (const t of p.tasks ?? []) {
    if (!p.slots.includes(t.slot)) err(`${p.id}: task 의 알 수 없는 슬롯 ${t.slot}`);
    const ids = new Set(t.options.map((o) => o.id));
    for (const c of p.correctSlots[t.slot] ?? []) if (!ids.has(c)) err(`${p.id}: ${t.slot} 선택지에 정답 ${c} 없음`);
    for (const k of [...p.distractors, ...Object.keys(p.conflicts)]) {
      const [slot, tok] = k.split(':');
      if (slot === t.slot && !ids.has(tok.replace(/^!/, ''))) err(`${p.id}: ${k} 가 ${t.slot} 선택지에 없음`);
    }
  }
  for (const pn of p.panels ?? []) {
    // 원문 문서는 단서 ID 로 참조한다(복사 금지). 단서가 아닌 문서만 lines 를 직접 가진다.
    if (pn.evidenceId && pn.lines) err(`${p.id}: 패널 ${pn.title} 이 evidenceId 와 lines 를 함께 가짐 (원문은 참조만)`);
    if (pn.evidenceId && !evidenceById.get(pn.evidenceId)?.body) err(`${p.id}: 패널 ${pn.title} 의 단서 ${pn.evidenceId} 에 body 없음`);
    if (!pn.evidenceId && pn.lines) for (const e of evidenceList) if (e.body && pn.lines.length >= 3 && pn.lines.every((l) => e.body!.includes(l))) err(`${p.id}: 패널 ${pn.title} 이 ${e.id} 원문을 복사함 — evidenceId 로 참조할 것`);
  }
  if (p.hintTexts.length !== 3) err(`${p.id}: hintTexts 는 3개`);
  const slotKeys = new Set(p.slots);
  for (const k of [...p.distractors, ...Object.keys(p.conflicts)]) {
    const slot = k.split(':')[0];
    if (slot !== '*' && !slotKeys.has(slot)) err(`${p.id}: 알 수 없는 슬롯 참조 ${k}`);
  }
}

// claims
dup(claims.map((c) => c.claimId), 'claim');
for (const c of claims) {
  if (c.requiresFlag && !flagsSetByPuzzles.has(c.requiresFlag)) err(`${c.claimId}: requiresFlag ${c.requiresFlag} 를 설정하는 퍼즐 없음`);
  if (c.hypotheses.filter((h) => h.isCorrect).length !== 1) err(`${c.claimId}: 정답 가설은 정확히 1개`);
  dup(c.hypotheses.map((h) => h.id), `${c.claimId} hypothesis`);
  for (const h of c.hypotheses) {
    const w = `${c.claimId}/${h.id}`;
    if (h.requiresFlag && !flagsSetByPuzzles.has(h.requiresFlag)) err(`${w}: requiresFlag ${h.requiresFlag} 를 설정하는 퍼즐 없음`);
    for (const id of [...h.supportEvidenceIds, ...h.rebuttalEvidenceIds, ...h.refutedBy]) needEv(id, w);
    for (const id of [...h.supportEvidenceIds, ...h.rebuttalEvidenceIds])
      if (evidenceById.get(id)?.sourceType === 'context') err(`${w}: context 단서 ${id} 가 필수 근거/반박 근거로 지정됨`);
    if (h.rebuttalEvidenceIds.some((id) => h.supportEvidenceIds.includes(id))) err(`${w}: 지지 근거와 반박 근거가 겹침`);
    if (h.isCorrect) {
      const types = new Set(h.supportEvidenceIds.map((id) => evidenceById.get(id)?.sourceType));
      if (types.size < c.requiredDistinctSourceTypes) err(`${w}: 정답 가설의 근거 유형이 ${c.requiredDistinctSourceTypes}종 미만`);
      if (!h.rebuttalEvidenceIds.length) err(`${w}: 정답 가설에 반박 근거 없음`);
    } else {
      if (h.supportEvidenceIds.length || h.rebuttalEvidenceIds.length) err(`${w}: 오답 가설은 지지/반박 근거를 갖지 않는다`);
      if (!h.refutedBy.length) err(`${w}: 오답 가설을 반증하는 자료(refutedBy) 없음`);
    }
    // 검증 가능한 단서만 근거가 될 수 있다: 검증 퍼즐이 있으면 퍼즐이 존재해야 한다 (위에서 보장)
  }
}

// endings
dup(endings.map((e) => e.id), 'ending');
const claimIds = new Set(claims.map((c) => c.claimId));
for (const id of ['ending_a', 'ending_b', 'ending_c', 'ending_d']) if (!endings.some((e) => e.id === id)) err(`엔딩 ${id} 없음`);
for (const [key, lines] of Object.entries(endingLines)) {
  if (Object.keys(lines[lines.length - 1].when).length) err(`endingLines.${key}: 마지막 줄은 조건이 비어 있어야 한다(기본값)`);
  lines.forEach((l, i) => {
    const w = l.when;
    for (const id of [...(w.solved ?? []), ...(w.notSolved ?? []), ...(w.anySolved ?? [])]) if (!claimIds.has(id)) err(`endingLines.${key}[${i}]: 없는 질문 ${id}`);
  });
}

if (errors.length) { console.error(errors.map((e) => `✗ ${e}`).join('\n')); process.exit(1); }
console.log(`validate OK (단서 ${evidenceList.length}, 질문 ${claims.length}, 퍼즐 ${puzzles.length}, 엔딩 ${endings.length}, 구역 ${Object.keys(areas).length}, 대사 미작성 NPC ${missing})`);
