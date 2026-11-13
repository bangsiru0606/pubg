import { describe, expect, it } from 'vitest';
import {
  acquireEvidence, chooseEvidencePreservation, claims, createGameState, evidenceById, evidenceList, isCorrectAnswer,
  isBasementOpen, loadGame, puzzles, wrongAnswerOf, resolveClaim, resolveEnding, saveConclusion, saveGame, setReportTarget,
  claimById, puzzleById, solvedClaimIds, type GameState, type PuzzleAnswer,
} from '../src/core';
import { submitPuzzle } from './helpers';

const ALL_EXCEPT_E16 = evidenceList.map((e) => e.id).filter((id) => id !== 'E16_secure_receipt');
const ANSWERS: Record<string, PuzzleAnswer> = Object.fromEntries(puzzles.map((p) => [p.id, p.correctSlots]));

/** 모든 단서를 얻고 모든 퍼즐을 푼 상태 */
function fullState(): GameState {
  const s = createGameState();
  ALL_EXCEPT_E16.forEach((id) => acquireEvidence(s, id));
  puzzles.forEach((p) => submitPuzzle(s, p.id, ANSWERS[p.id]));
  return s;
}
const hyp = (claimId: string, correct: boolean, nth = 0) =>
  claimById.get(claimId)!.hypotheses.filter((h) => h.isCorrect === correct)[nth].id;
const correctPick = (c: string) => hyp(c, true);
const GOOD: Record<string, [string[], string[]]> = {
  claim_a: [['E02_altar_blood', 'E03_preliminary_exam'], ['E07_report_revision']],
  claim_b: [['E04_wristband_fragment', 'E08_miran_revised'], ['E05_access_log']],
  claim_c: [['E07_report_revision', 'E08_miran_revised'], ['E06_torn_sleeve']],
  claim_d: [['E12_ledger', 'E14_belongings_diary'], ['E15_transport_manifest']],
};
function answer(s: GameState, claimId: string, good: boolean) {
  if (good) { const r = saveConclusion(s, claimId, correctPick(claimId), ...GOOD[claimId]); expect(r).toEqual({ ok: true }); }
  else saveConclusion(s, claimId, hyp(claimId, false), [], []);
}

describe('12.1 추리 공정성', () => {
  it('1. 각 정답 가설이 두 유형 이상의 자료로 증명된다', () => {
    for (const c of claims) {
      const h = c.hypotheses.find((x) => x.isCorrect)!;
      expect(new Set(h.supportEvidenceIds.map((id) => evidenceById.get(id)!.sourceType)).size).toBeGreaterThanOrEqual(2);
      const s = fullState();
      answer(s, c.claimId, true);
      expect(resolveClaim(s, c).solved).toBe(true);
    }
  });
  it('2. 오답 가설(독살 등)마다 반박 자료가 있고 모두 획득 가능하다', () => {
    for (const c of claims) for (const h of c.hypotheses.filter((x) => !x.isCorrect)) {
      expect(h.refutedBy.length).toBeGreaterThan(0);
      for (const id of h.refutedBy) expect(ALL_EXCEPT_E16).toContain(id);
    }
    const poison = claimById.get('claim_a')!.hypotheses.find((h) => h.id === 'a2_poison')!;
    expect(poison.temptation).toBeTruthy();
  });
  it('3. 정하늘의 현장 존재(E04·E05)만으로는 계획 살인을 반증/확정하지 못하고 의도는 별도 가설로 판단', () => {
    const s = fullState();
    // 현장 존재 증거만 제출하며 "계획적 살해"를 선택 → 해결 안 됨
    saveConclusion(s, 'claim_b', 'b1_premeditated', ['E04_wristband_fragment', 'E05_access_log'], []);
    expect(resolveClaim(s, claimById.get('claim_b')!).solved).toBe(false);
    // E05는 지지 근거가 아니라 반박 근거로만 쓰인다
    const h = claimById.get('claim_b')!.hypotheses.find((x) => x.isCorrect)!;
    expect(h.supportEvidenceIds).not.toContain('E05_access_log');
    expect(h.rebuttalEvidenceIds).toContain('E05_access_log');
  });
  it('4. 질문 C: 근거가 1개뿐이면 확정되지 않고, 수정 이력 + 이송 지시서(기록 둘)나 수정 이력 + 오미란 수정 진술이면 해결된다 (유형 조건 없음)', () => {
    const s = fullState();
    saveConclusion(s, 'claim_c', 'c3_baek_lee', ['E07_report_revision'], ['E06_torn_sleeve']);
    expect(resolveClaim(s, claimById.get('claim_c')!).solved).toBe(false);
    saveConclusion(s, 'claim_c', 'c3_baek_lee', ['E07_report_revision', 'E11_transfer_order'], ['E06_torn_sleeve']);
    expect(resolveClaim(s, claimById.get('claim_c')!).solved).toBe(true);
    saveConclusion(s, 'claim_c', 'c3_baek_lee', ['E07_report_revision', 'E08_miran_revised'], ['E06_torn_sleeve']);
    expect(resolveClaim(s, claimById.get('claim_c')!).solved).toBe(true);
  });
  it('5. 질문 D: 장부(E12)만으로는 확정되지 않고, 장부 + 연결표(기록 둘)면 해결된다', () => {
    const s = fullState();
    saveConclusion(s, 'claim_d', 'd3_p271', ['E12_ledger'], ['E15_transport_manifest']);
    expect(resolveClaim(s, claimById.get('claim_d')!).solved).toBe(false);
    saveConclusion(s, 'claim_d', 'd3_p271', ['E12_ledger', 'E13_identity_map'], ['E15_transport_manifest']);
    expect(resolveClaim(s, claimById.get('claim_d')!).solved).toBe(true);
  });
});

describe('증명 규칙', () => {
  it('맥락 단서(E01)는 근거 슬롯에 넣을 수 없다', () => {
    const s = fullState();
    expect(saveConclusion(s, 'claim_a', 'a3_collision', ['E01_last_letter', 'E02_altar_blood'], []).ok).toBe(false);
  });
  it('미검증 단서는 제출할 수 없고, 퍼즐 해결 뒤에 가능하다', () => {
    const s = createGameState();
    acquireEvidence(s, 'E02_altar_blood'); acquireEvidence(s, 'E03_preliminary_exam');
    expect(s.verifiedEvidenceIds).toEqual([]);
    expect(saveConclusion(s, 'claim_a', 'a3_collision', ['E02_altar_blood'], []).ok).toBe(false);
    submitPuzzle(s, 'P01_scene_rebuild', ANSWERS.P01_scene_rebuild);
    expect(saveConclusion(s, 'claim_a', 'a3_collision', ['E02_altar_blood'], []).ok).toBe(true);
  });
  it('퍼즐 해결 전 획득한 단서는 미검증, 퍼즐 없는 단서(E04)는 즉시 검증, 해결 후 획득은 즉시 검증', () => {
    const s = createGameState();
    acquireEvidence(s, 'E04_wristband_fragment');
    expect(s.verifiedEvidenceIds).toContain('E04_wristband_fragment');
    submitPuzzle(s, 'P02_night_timeline', ANSWERS.P02_night_timeline);
    acquireEvidence(s, 'E05_access_log');
    expect(s.verifiedEvidenceIds).toContain('E05_access_log');
  });
  it('근거 점수는 정답 가설의 맞는 근거 2개면 받는다 — 유형은 묻지 않는다 (5차 피드백)', () => {
    const s = fullState();
    saveConclusion(s, 'claim_b', 'b3_selfdefense', ['E08_miran_revised'], ['E05_access_log']);
    expect(resolveClaim(s, claimById.get('claim_b')!).evidencePoint).toBe(0); // 근거가 1개뿐
    saveConclusion(s, 'claim_b', 'b3_selfdefense', ['E09_sedative_gap', 'E08_miran_revised'], ['E05_access_log']);
    expect(resolveClaim(s, claimById.get('claim_b')!).solved).toBe(true);
    // 같은 유형(기록·기록) 2개: 질문 D(장부 + 연결표), 질문 C(수정 이력 + 이송 지시서)
    saveConclusion(s, 'claim_d', 'd3_p271', ['E12_ledger', 'E13_identity_map'], ['E15_transport_manifest']);
    expect(resolveClaim(s, claimById.get('claim_d')!).solved).toBe(true);
    saveConclusion(s, 'claim_c', 'c3_baek_lee', ['E07_report_revision', 'E11_transfer_order'], ['E06_torn_sleeve']);
    expect(resolveClaim(s, claimById.get('claim_c')!).solved).toBe(true);
    // 정답 가설의 근거가 아닌 자료(맥락·오답 근거)는 세지 않는다
    saveConclusion(s, 'claim_d', 'd3_p271', ['E12_ledger', 'E02_altar_blood'], ['E15_transport_manifest']);
    expect(resolveClaim(s, claimById.get('claim_d')!).evidencePoint).toBe(0);
  });
  it('오답 가설은 근거가 많아도 해결 처리하지 않는다', () => {
    const s = fullState();
    saveConclusion(s, 'claim_a', 'a2_poison', ['E02_altar_blood', 'E03_preliminary_exam'], ['E07_report_revision']);
    const r = resolveClaim(s, claimById.get('claim_a')!);
    expect(r.score).toBe(0);
    expect(r.solved).toBe(false);
  });
  it('결론 저장은 정답 여부를 알려주지 않는다 (ok 만 반환)', () => {
    const s = fullState();
    const r = saveConclusion(s, 'claim_a', 'a2_poison', [], []);
    expect(r).toEqual({ ok: true });
  });
  it('P01 해결 전에는 충돌 가설, P05 해결 전에는 질문 D 를 고를 수 없다', () => {
    const s = createGameState();
    expect(saveConclusion(s, 'claim_a', 'a3_collision', [], []).ok).toBe(false);
    expect(saveConclusion(s, 'claim_d', 'd3_p271', [], []).ok).toBe(false);
  });
});

describe('12.2 분기', () => {
  const finish = (s: GameState, good: string[], target: 'external' | 'eunho_only', secure: boolean) => {
    claims.forEach((c) => answer(s, c.claimId, good.includes(c.claimId)));
    chooseEvidencePreservation(s, secure);
    setReportTarget(s, target);
    return resolveEnding(s).id;
  };
  it('1. 네 가설 정답 + 증거 보존 + 외부 보고 → A', () => {
    const s = fullState();
    expect(finish(s, ['claim_a', 'claim_b', 'claim_c', 'claim_d'], 'external', true)).toBe('ending_a');
    expect(s.evidenceIds).toContain('E16_secure_receipt');
  });
  it('2. 사망·정하늘만 해결 → B (보존·보고와 무관)', () => {
    for (const secure of [true, false]) for (const t of ['external', 'eunho_only'] as const)
      expect(finish(fullState(), ['claim_a', 'claim_b'], t, secure)).toBe('ending_b');
  });
  it('3. 미해결 1개 이하 + (미보존 또는 외부 보고 안 함) → C', () => {
    expect(finish(fullState(), ['claim_a', 'claim_b', 'claim_c'], 'external', false)).toBe('ending_c');
    expect(finish(fullState(), ['claim_a', 'claim_b', 'claim_c', 'claim_d'], 'eunho_only', true)).toBe('ending_c');
  });
  it('4. 미해결 2개 이상 또는 질문 A 미해결 → D', () => {
    expect(finish(fullState(), [], 'external', true)).toBe('ending_d');
    expect(finish(fullState(), ['claim_b', 'claim_c', 'claim_d'], 'external', true)).toBe('ending_d');
  });
  it('가설 선택 후에도 언제든 결론을 바꿀 수 있다', () => {
    const s = fullState();
    answer(s, 'claim_a', false);
    expect(solvedClaimIds(s)).toEqual([]);
    answer(s, 'claim_a', true);
    expect(solvedClaimIds(s)).toEqual(['claim_a']);
  });
});

describe('12.4 퍼즐', () => {
  const sub = (id: string, a: PuzzleAnswer, s = createGameState()) => ({ s, r: submitPuzzle(s, id, a) });
  it('정답 5종 해결, 플래그·검증 처리', () => {
    const s = fullState();
    expect(s.solvedPuzzleIds).toHaveLength(5);
    expect(s.flags).toEqual(expect.arrayContaining(['flag_scene_rebuilt', 'flag_night_timeline', 'flag_claim_d_open']));
    expect(s.verifiedEvidenceIds).toHaveLength(15); // E01 포함 E16 제외 전부 (E01 은 퍼즐 없음 → 즉시 검증)
    expect(isBasementOpen(s)).toBe(false); // 퍼즐을 다 풀어도 열쇠(오미란이 건네는 basement_key)가 있어야 지하가 열린다
    s.flags.push('basement_key'); expect(isBasementOpen(s)).toBe(true);
    expect(isBasementOpen(createGameState())).toBe(false);
  });
  it('1~5. 틀린 답도 한 번 확정하면 같은 settled 이고, 풀리지 않은 채 정리된다 (결과는 돌려주지 않는다)', () => {
    const wrongs: [string, PuzzleAnswer][] = [
      ['P01_scene_rebuild', { path: ['c1_head', 'c2_fight', 'c3_chair', 'c4_moved'] }],
      ['P02_night_timeline', { t2234: ['t_out'], t2241: ['t_door'], t2246: ['d_sermon'], t2251: ['t_time'], excluded: ['d_prayer', 't_thud'] }],
      ['P03_revision_diff', { chg_position: ['impact_injury'], chg_laceration: ['body_moved'], chg_breath: ['alive_delay'] }],
      ['P04_approval_chain', { doc_selection: ['lee_hanshin'], doc_approval: ['lee_hyejeong'], doc_schedule: ['baek_sunwoo'], doc_transfer: ['baek_sunwoo'] }],
      ['P05_patient_code', { ...ANSWERS.P05_patient_code, admissionMatch: ['yujin'], belongingMatch: ['yujin'], linkedSources: ['E14_belongings_diary'], identity: ['yujin'] }],
    ];
    for (const [id, a] of wrongs) { const { s, r } = sub(id, a); expect(r).toEqual({ status: 'settled' }); expect(s.failedPuzzleIds).toEqual([id]); expect(s.solvedPuzzleIds).toEqual([]); }
  });
  it('P05 는 일기장 하나로만 연결해도 맞지 않는다', () => {
    expect(isCorrectAnswer(puzzleById.get('P05_patient_code')!, { ...ANSWERS.P05_patient_code, linkedSources: ['E14_belongings_diary'] })).toBe(false);
  });
  it('빈 슬롯 제출은 정리한 것으로 치지 않는다', () => {
    const s = createGameState();
    expect(submitPuzzle(s, 'P02_night_timeline', { t2234: ['t_out'] }).status).toBe('incomplete');
    expect(s.wrongCountByPuzzle.P02_night_timeline ?? 0).toBe(0); expect(s.failedPuzzleIds).toEqual([]);
  });
  it('7. 퍼즐을 전부 틀리게 정리해도 이야기는 엔딩까지 이어진다 (엔딩 A 는 검증된 단서가 필요하다)', () => {
    const s = createGameState();
    ALL_EXCEPT_E16.forEach((id) => acquireEvidence(s, id));
    for (const p of puzzles) {
      submitPuzzle(s, p.id, wrongAnswerOf(p));
      expect(s.failedPuzzleIds).toContain(p.id);
    }
    chooseEvidencePreservation(s, true); setReportTarget(s, 'external');
    expect(resolveEnding(s).id).toBe('ending_d'); // 결론을 하나도 풀 수 없다
  });
  it('이미 정리한 퍼즐은 already_settled', () => {
    const s = fullState();
    expect(submitPuzzle(s, 'P01_scene_rebuild', ANSWERS.P01_scene_rebuild).status).toBe('already_settled');
    expect(puzzleById.size).toBe(5);
  });
});

describe('12.3 진행: 결론에 필요한 자료를 모두 획득할 수 있다', () => {
  it('정답 가설의 모든 근거가 단서 목록에 있고 context 가 아니다', () => {
    for (const c of claims) for (const h of c.hypotheses.filter((x) => x.isCorrect))
      for (const id of [...h.supportEvidenceIds, ...h.rebuttalEvidenceIds]) {
        expect(evidenceById.get(id)).toBeDefined();
        expect(evidenceById.get(id)!.sourceType).not.toBe('context');
      }
  });
  it('관련 없는 단서 제시/제출이 진행을 막지 않는다 (엉뚱한 근거를 넣어도 다시 저장 가능)', () => {
    const s = fullState();
    saveConclusion(s, 'claim_a', 'a3_collision', ['E10_consent_forms', 'E12_ledger'], []);
    answer(s, 'claim_a', true);
    expect(solvedClaimIds(s)).toContain('claim_a');
  });
});

describe('저장/불러오기', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
  it('왕복 저장', () => {
    const store = mem(), s = fullState();
    answer(s, 'claim_a', true);
    expect(saveGame(s, store)).toBe(true);
    expect(loadGame(store)).toEqual(s);
  });
  it('저장소가 없거나 던져도 진행에 영향 없음', () => {
    expect(saveGame(createGameState(), null)).toBe(false);
    expect(saveGame(createGameState(), { getItem: () => null, setItem: () => { throw new Error('quota'); } })).toBe(false);
    expect(loadGame({ getItem: () => { throw new Error('denied'); }, setItem: () => {} })).toBeNull();
    expect(loadGame(null)).toBeNull();
  });
  it('깨진 저장본은 null', () => {
    expect(loadGame({ getItem: () => '{not json', setItem: () => {} })).toBeNull();
    expect(loadGame({ getItem: () => '{"flags":3}', setItem: () => {} })).toBeNull();
  });
});
