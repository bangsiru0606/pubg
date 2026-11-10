import { describe, expect, it } from 'vitest';
import real from '../src/data/dialogue.json';
import {
  acquireEvidence, availableChoices, claimById, createGameState, enterNode, evidenceList, gradeOf, hasFlag, loadGame, puzzles, relatedEvidenceIds,
  resolveEnding, saveConclusion, saveGame, setReportTarget, shownEvidence, startNodeOf, submitPuzzle, type Dialogues, type GameState, type KeyValueStore,
} from '../src/core';
import { areas, autoTriggered, isAvailable } from '../src/explore/interaction';
import { buildProgress } from '../src/explore/playthrough';

const D = real.dialogues as unknown as Dialogues;
const P = (id: string) => puzzles.find((p) => p.id === id)!;

/** 실제 플레이로 얻을 수 있는 상태: 씬 1~6 을 모두 거친(= 씬 7 시작) 상태. 디버그 메뉴의 씬 점프와 같은 함수. */
const playThrough = (secure: boolean): GameState => buildProgress(7, { secure }).state;
const GOOD: Record<string, [string[], string[]]> = {
  claim_a: [['E02_altar_blood', 'E03_preliminary_exam'], ['E07_report_revision']],
  claim_b: [['E04_wristband_fragment', 'E08_miran_revised'], ['E05_access_log']],
  claim_c: [['E07_report_revision', 'E08_miran_revised'], ['E06_torn_sleeve']],
  claim_d: [['E12_ledger', 'E14_belongings_diary'], ['E15_transport_manifest']],
};
function answer(s: GameState, good: string[]) {
  for (const [cid, [sup, reb]] of Object.entries(GOOD)) {
    const c = claimById.get(cid)!;
    if (good.includes(cid)) expect(saveConclusion(s, cid, c.hypotheses.find((h) => h.isCorrect)!.id, sup, reb)).toEqual({ ok: true });
    else expect(saveConclusion(s, cid, c.hypotheses.find((h) => !h.isCorrect)!.id, [], ['E02_altar_blood'])).toEqual({ ok: true });
  }
}
const end = (s: GameState) => resolveEnding(s).id;

describe('12.3 진행', () => {
  it('1. 단서 16개를 모두 실제 지도·대사에서 얻을 수 있다 (E16 은 씬 6 선택 A)', () => {
    expect([...playThrough(true).evidenceIds].sort()).toEqual(evidenceList.map((e) => e.id).sort());
    expect(playThrough(false).evidenceIds).not.toContain('E16_secure_receipt');
  });
  it('3. 지하 이후 2층 강제 왕복이 없다: 지하 이후 필요한 조건은 지하 안에서 얻거나 지하 개방 전에 필수', () => {
    const b1 = areas.b1.interactables;
    expect(b1.filter((i) => i.type === 'transition').map((i) => (i as { to: string }).to)).toEqual(['floor1']);
    const inB1 = new Set<string>(['flag_claim_d_open', 'diary_closed']); // P05 해결·일기장 닫기도 지하 안에서 일어난다
    for (const it of b1) {
      if (it.type === 'examine') [it.evidenceId, ...(it.evidenceIds ?? [])].filter(Boolean).forEach((x) => inB1.add(`evidence:${x}`));
      if (it.type === 'npc') for (const n of Object.values(D[it.dialogueId].nodes)) { (n.onEnter?.setFlags ?? []).forEach((f) => inB1.add(f)); (n.onEnter?.acquire ?? []).forEach((e) => inB1.add(`evidence:${e}`)); }
    }
    const beforeB1 = new Set<string>(P('P02_night_timeline').openWhen!.flags!); // 3층 계단 조건 = 지하 이전 필수
    const need = [...(P('P05_patient_code').openWhen!.flags ?? []), ...(P('P05_patient_code').openWhen!.evidence ?? []).map((e) => `evidence:${e}`),
      ...b1.flatMap((i) => (i.type === 'npc' ? [...(i.autoWhen ?? []), ...(i.showWhen ? [i.showWhen] : [])] : []))];
    for (const c of need) expect(inB1.has(c) || beforeB1.has(c), `${c} 는 지하 안에서 얻거나 지하 개방 전에 필수여야 한다`).toBe(true);
  });
});

describe('12.2 분기 (실제 플레이 상태에서 선택 A/B × 보고 대상)', () => {
  it('1. 엔딩 A: 4개 해결 + 선택 A + 외부 보고', () => {
    const s = playThrough(true); answer(s, ['claim_a', 'claim_b', 'claim_c', 'claim_d']); setReportTarget(s, 'external');
    expect(s.evidenceSecured).toBe(true); expect(end(s)).toBe('ending_a');
    setReportTarget(s, 'eunho_only'); expect(end(s)).toBe('ending_c'); // 보고 대상이 박은호뿐이면 A 가 아니다
  });
  it('2. 엔딩 B: A·B 만 해결(보존·보고와 무관)', () => {
    for (const secure of [true, false]) { const s = playThrough(secure); answer(s, ['claim_a', 'claim_b']); setReportTarget(s, 'eunho_only'); expect(end(s)).toBe('ending_b'); }
  });
  it('3. 엔딩 C: 선택 B(즉시 대면)로 증거 미보존, 4개 해결', () => {
    const s = playThrough(false); answer(s, ['claim_a', 'claim_b', 'claim_c', 'claim_d']); setReportTarget(s, 'external');
    expect(s.evidenceSecured).toBe(false); expect(end(s)).toBe('ending_c');
  });
  it('4. 엔딩 D: 2개 이상 오답 (또는 질문 A 오답)', () => {
    const s = playThrough(true); answer(s, ['claim_c', 'claim_d']); setReportTarget(s, 'external'); expect(end(s)).toBe('ending_d');
    const t = playThrough(true); answer(t, ['claim_b', 'claim_c', 'claim_d']); setReportTarget(t, 'external'); expect(end(t)).toBe('ending_d');
  });
  it('5. 엔딩 B(나머지): 하나만 틀림 + 보존 + 외부 보고', () => {
    const s = playThrough(true); answer(s, ['claim_a', 'claim_b', 'claim_c']); setReportTarget(s, 'external'); expect(end(s)).toBe('ending_b');
  });
  it('선택 B 이후에도 보고서를 제출하면 판정된다', () => {
    const s = playThrough(false); answer(s, ['claim_a']); setReportTarget(s, 'external'); expect(['ending_c', 'ending_d']).toContain(end(s));
  });
});

describe('씬 5·P05', () => {
  it('P05 열림: 한유진 진술 + E12~E15, 해결하면 E12~E15 검증 + 질문 D 개방', () => {
    const w = P('P05_patient_code').openWhen!;
    expect(w.flags).toEqual(['han_done']);
    expect(w.evidence).toEqual(['E12_ledger', 'E13_identity_map', 'E14_belongings_diary', 'E15_transport_manifest']);
    const s = createGameState(); w.evidence!.forEach((id) => acquireEvidence(s, id));
    expect(submitPuzzle(s, 'P05_patient_code', P('P05_patient_code').correctSlots).status).toBe('solved');
    expect(s.verifiedEvidenceIds).toEqual(expect.arrayContaining(w.evidence!));
    expect(hasFlag(s, 'flag_claim_d_open')).toBe(true);
  });
  it('한유진 진술 ID 로 유품과 대조한다 (일기장만으로는 확정할 수 없다)', () => {
    const p = P('P05_patient_code');
    expect(p.statements).toEqual(['han_s_bracelet']);
    expect(p.correctSlots.linkedSources).toContain('han_s_bracelet');
    expect(submitPuzzle(createGameState(), p.id, { ...p.correctSlots, linkedSources: ['E14_belongings_diary'] }).status).toBe('wrong');
  });
  it('오답은 충돌 조건만 알려 준다', () => {
    const r = submitPuzzle(createGameState(), 'P05_patient_code', { ...P('P05_patient_code').correctSlots, identity: ['yujin'] });
    expect(r.status).toBe('wrong'); expect(r.conflicts).toEqual(['혈액형은 일치하지만 나이와 입원번호가 다릅니다.']);
  });
  it('E14 원문을 닫으면 계단 쪽에서 정하늘이 나타나 자동으로 대화한다', () => {
    const s = createGameState();
    expect(autoTriggered('b1', areas.b1, 400, s)).toBeNull();
    s.flags.push('diary_closed');
    expect(autoTriggered('b1', areas.b1, 400, s)?.id).toBe('haneul_b1');
  });
  it('정하늘 최종 대면: 선택지 3개를 모두 듣고 이어진다, 면죄하지 않는다, 방송으로 끝', () => {
    const s = createGameState(); const f5 = D.jeong_haneul_final.nodes.f5;
    expect(availableChoices(s, f5).map((c) => c.next)).toEqual(['fc1', 'fc2', 'fc3']);
    for (const id of ['fc1', 'fc2', 'fc3']) enterNode(s, D.jeong_haneul_final.nodes[id]);
    expect(availableChoices(s, f5).map((c) => c.next)).toEqual(['f6']);
    expect(Object.values(D.jeong_haneul_final.nodes).map((n) => n.text).join('\n')).not.toMatch(/정당방위|죄가 없/);
    expect(D.jeong_haneul_final.nodes.f8.text).toBe('특별 치료 대상자 이송까지 15분 남았습니다. 관계자는 지정 위치로 이동하십시오.');
  });
});

describe('씬 6·7', () => {
  it('선택 A: E16 + evidenceSecured, 선택 B: 보존 없음, 선택 B 에는 회수 경고와 되돌릴 수 없다는 안내', () => {
    const a = createGameState(); enterNode(a, D.eunho_message.nodes.a1);
    expect(a.evidenceSecured).toBe(true); expect(a.evidenceIds).toContain('E16_secure_receipt');
    const b = createGameState(); enterNode(b, D.eunho_message.nodes.b1);
    expect(b.evidenceSecured).toBe(false); expect(b.evidenceIds).not.toContain('E16_secure_receipt');
    const m2 = D.eunho_message.nodes.m2;
    expect(m2.text).toContain('회수될 수 있고'); expect(m2.text).toContain('되돌릴 수 없다');
    expect(m2.choices!.find((c) => c.text.startsWith('[B]'))!.text).toContain('회수될 수 있다');
    expect(D.eunho_message.nodes.bc.text).toContain('되돌릴 수 없다');
    expect(D.eunho_message.then).toBe('report');
  });
  it('scene6 사건은 정하늘 고백 + P05 해결 뒤에 시작된다', () => {
    const s = createGameState();
    expect(autoTriggered('b1', areas.b1, 0, s)).toBeNull();
    s.flags.push('haneul_confessed');
    expect(autoTriggered('b1', areas.b1, 0, s)).toBeNull();
    s.flags.push('flag_claim_d_open');
    expect(autoTriggered('b1', areas.b1, 0, s)?.id).toBe('scene6');
  });
  it('엔딩 후 추리 등급: 질문별 해결·반박 적중·힌트 횟수 (힌트는 엔딩에 영향 없음)', () => {
    const s = playThrough(true); answer(s, ['claim_a', 'claim_b', 'claim_c', 'claim_d']); setReportTarget(s, 'external');
    const before = end(s);
    s.hintCountByPuzzle.P01_scene_rebuild = 3; s.wrongCountByPuzzle.P01_scene_rebuild = 6;
    const g = gradeOf(s);
    expect(g.claims.every((c) => c.solved && c.rebuttalHit)).toBe(true);
    expect(g.letter).toBe('S'); expect(g.hintedPuzzles).toBe(1); expect(g.maxHintLevel).toBe(3); expect(g.wrongTotal).toBeGreaterThanOrEqual(6);
    expect(end(s)).toBe(before);
  });
  it('엔딩 D 재도전: 미해결 질문과 관련된 단서 집합', () => {
    const rel = relatedEvidenceIds(['claim_d']);
    expect(rel.has('E12_ledger')).toBe(true); expect(rel.has('E02_altar_blood')).toBe(false);
  });
  it('저장: 씬 7 시작 시점 슬롯이 따로 있고, 저장소가 막혀도 오류 없이 계속된다', () => {
    const mem: Record<string, string> = {}; const store: KeyValueStore = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
    const s = playThrough(true); saveGame(s, store, 'report'); saveGame(createGameState(), store);
    expect(loadGame(store, 'report')!.evidenceIds.length).toBe(s.evidenceIds.length);
    expect(loadGame(store)!.evidenceIds).toEqual([]);
    expect(saveGame(s, null)).toBe(false);
  });
  it('E14 원문을 닫으면 켜지는 플래그가 데이터에 있다', () => expect(shownEvidence(createGameState(), 'E14_belongings_diary')!.afterView).toBe('diary_closed'));
  it('지하 계단 조건은 변하지 않는다', () => expect(isAvailable(areas.floor1.interactables.find((i) => i.id === 'stairs_b1')!, createGameState())).toBe(false));
  it('연속 호출해도 startNodeOf 는 처음부터', () => expect(startNodeOf(createGameState(), D.jeong_haneul_final)).toBe('f1'));
});

describe('씬 점프 상태 (디버그 메뉴 = 정상 플레이와 같은 상태)', () => {
  const solved = (n: number) => buildProgress(n).state.solvedPuzzleIds.map((id) => id.slice(0, 3));
  it('씬 N 시작 시점에는 앞선 씬의 퍼즐만 풀려 있다', () => {
    expect(solved(1)).toEqual([]); expect(solved(2)).toEqual([]); expect(solved(3)).toEqual(['P01']);
    expect(solved(4)).toEqual(['P01', 'P02']); expect(solved(5)).toEqual(['P01', 'P02', 'P03', 'P04']);
    expect(solved(6)).toEqual(['P01', 'P02', 'P03', 'P04', 'P05']);
  });
  it('씬 6 시작에는 정하늘 고백·P05 가 끝나 있어 씬 6 사건이 바로 시작된다, 씬 7 시작에는 증거 보존 선택이 끝나 있다', () => {
    const s6 = buildProgress(6).state;
    expect(autoTriggered('b1', areas.b1, 0, s6)?.id).toBe('scene6');
    expect(buildProgress(7, { secure: true }).state.evidenceSecured).toBe(true);
    expect(buildProgress(7, { secure: false }).state.evidenceSecured).toBe(false);
  });
  it('이름 유지, 단서 검증 상태는 정상 플레이와 같다 (퍼즐 해결 후 검증)', () => {
    const { state } = buildProgress(5, { name: '서윤' });
    expect(state.playerName).toBe('서윤');
    expect(state.verifiedEvidenceIds).toEqual(expect.arrayContaining(['E02_altar_blood', 'E07_report_revision', 'E10_consent_forms']));
    expect(state.verifiedEvidenceIds).not.toContain('E12_ledger');
  });
});

describe('씬 점프 진술 상태', () => {
  it('씬 5 시작 시점: 백선우 진술은 모순, 오미란 진술은 수정 (정상 플레이와 같다)', () => {
    const { state } = buildProgress(5);
    expect(state.statements.baek_s_natural.stage).toBe('contradiction');
    expect(state.statements.oh_s_first.stage).toBe('revised');
    expect(state.statements.choi_s_prayer.stage).toBe('contradiction'); // 방송표
    expect(state.statements.haneul_s_denial.stage).toBe('unconfirmed'); // 정하늘의 부정은 모순으로 바뀌지 않는다
  });
});
