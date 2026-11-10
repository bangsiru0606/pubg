// 데이터 ID 참조 무결성 검사: npm run validate
import { existsSync } from 'node:fs';
import map from '../src/data/map.json' with { type: 'json' };
import { claims, endingLines, endings, evidenceById, evidenceList, puzzles } from '../src/core/data';

const errors: string[] = [];
const err = (m: string) => errors.push(m);
const TYPES = ['physical', 'record', 'testimony', 'context'];
const PUZZLE_TYPES = ['SpatialPlacement', 'Timeline', 'DocumentDiff', 'Connection', 'LogicGrid'];
const dup = (ids: string[], what: string) => ids.forEach((id, i) => ids.indexOf(id) !== i && err(`${what} 중복 id: ${id}`));

// map
for (const o of map.office.objects) if (!existsSync(`public/assets/${o.tex}.png`)) err(`map: 누락 에셋 ${o.tex}`);

// evidence
dup(evidenceList.map((e) => e.id), 'evidence');
for (const e of evidenceList) if (!TYPES.includes(e.sourceType)) err(`${e.id}: sourceType ${e.sourceType}`);
const needEv = (id: string, where: string) => { if (!evidenceById.has(id)) err(`${where}: 없는 단서 ${id}`); };

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
console.log(`validate OK (단서 ${evidenceList.length}, 질문 ${claims.length}, 퍼즐 ${puzzles.length}, 엔딩 ${endings.length})`);
