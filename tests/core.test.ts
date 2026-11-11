import { describe, expect, it } from 'vitest';
import {
  acquireEvidence, chooseEvidencePreservation, claims, createGameState, evidenceById, evidenceList, hintLevelFor,
  isBasementOpen, loadGame, puzzles, resolveClaim, resolveEnding, saveConclusion, saveGame, setReportTarget,
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
  it('4. 오미란 수정 증언(E08) 없이는 현장 위조를 확정할 수 없다', () => {
    const s = fullState();
    saveConclusion(s, 'claim_c', 'c3_baek_lee', ['E07_report_revision', 'E11_transfer_order'], ['E06_torn_sleeve']); // 기록 둘뿐
    const r = resolveClaim(s, claimById.get('claim_c')!);
    expect(r.evidencePoint).toBe(0);
    expect(r.solved).toBe(false);
    saveConclusion(s, 'claim_c', 'c3_baek_lee', ['E07_report_revision', 'E08_miran_revised'], ['E06_torn_sleeve']);
    expect(resolveClaim(s, claimById.get('claim_c')!).solved).toBe(true);
  });
  it('5. 장부(E12)만, 또는 기록 두 개만으로 박은지 신원을 확정하지 않는다', () => {
    const s = fullState();
    saveConclusion(s, 'claim_d', 'd3_p271', ['E12_ledger'], ['E15_transport_manifest']);
    expect(resolveClaim(s, claimById.get('claim_d')!).solved).toBe(false);
    saveConclusion(s, 'claim_d', 'd3_p271', ['E12_ledger', 'E13_identity_map'], ['E15_transport_manifest']);
    expect(resolveClaim(s, claimById.get('claim_d')!).solved).toBe(false);
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
  it('증언 두 개만 제출하면 근거 유형 조건 불충족', () => {
    const s = fullState();
    saveConclusion(s, 'claim_b', 'b3_selfdefense', ['E08_miran_revised'], ['E05_access_log']);
    expect(resolveClaim(s, claimById.get('claim_b')!).evidencePoint).toBe(0);
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
    expect(isBasementOpen(s)).toBe(true);
    expect(isBasementOpen(createGameState())).toBe(false);
  });
  it('1. P01 최초/위조 후 위치를 뒤바꾸면 해결되지 않는다', () => {
    const { r } = sub('P01_scene_rebuild', { impactPosition: ['desk_chair'], finalPosition: ['altar_floor'], movedObjects: ['body', 'chair'] });
    expect(r.status).toBe('wrong');
    expect(r.conflicts.length).toBeGreaterThan(0);
  });
  it('2. P02 예약 설교를 동선에 넣으면 시간 충돌을 표시', () => {
    const { r } = sub('P02_night_timeline', { t2234: ['key_lost'], t2241: ['door_open'], t2246: ['sermon'], t2251: ['return_room'] });
    expect(r.status).toBe('wrong');
    expect(r.conflicts.join()).toContain('예약 재생');
  });
  it('3. P03 맞춤법 변경을 선택하면 정답 처리하지 않는다', () => {
    const { r } = sub('P03_revision_diff', { marked: ['position_changed', 'laceration_deleted', 'spelling_fix'] });
    expect(r.status).toBe('wrong');
    expect(r.conflicts).toHaveLength(1); expect(r.conflicts.join()).toContain('띄어쓰기');
    expect(sub('P03_revision_diff', { marked: [...ANSWERS.P03_revision_diff.marked, 'spelling_fix'] }).r.status).toBe('wrong');
  });
  it('4. P04 LHJ/LHS 혼동 시 선정·승인 권한 충돌 표시', () => {
    const { r } = sub('P04_approval_chain', { doc_selection: ['lee_hanshin'], doc_approval: ['lee_hyejeong'], doc_schedule: ['baek_sunwoo'], doc_transfer: ['baek_sunwoo'] });
    expect(r.status).toBe('wrong');
    expect(r.conflicts).toHaveLength(1); expect(r.conflicts.join()).toContain('작성 약자');
  });
  it('5. P05 나이·혈액형만 맞추고 입원번호·유품·자료 연결이 없으면 확정되지 않는다', () => {
    const p = ANSWERS.P05_patient_code;
    const partial = { ...p, admissionMatch: ['yujin'], belongingMatch: ['yujin'], linkedSources: ['E14_belongings_diary'], identity: ['yujin'] };
    const { r } = sub('P05_patient_code', partial);
    expect(r.status).toBe('wrong');
    expect(r.conflicts).toHaveLength(1); expect(r.conflicts.join()).toContain('연결표');
    // 일기장 하나로만 연결해도 불가
    expect(sub('P05_patient_code', { ...p, linkedSources: ['E14_belongings_diary'] }).r.status).toBe('wrong');
  });
  it('6. 오답 2·4·6회에서 힌트 단계가 정확히 1·2·3으로 오른다', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(hintLevelFor)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    const s = createGameState();
    const wrong: PuzzleAnswer = { marked: ['spelling_fix'] };
    const levels = Array.from({ length: 6 }, () => submitPuzzle(s, 'P03_revision_diff', wrong).hint.level);
    expect(levels).toEqual([0, 1, 1, 2, 2, 3]);
    const last = submitPuzzle(s, 'P03_revision_diff', wrong).hint;
    expect(last.removedTokens).toEqual(['marked:spelling_fix']);
    expect(last.autoFill).not.toBeNull();
    expect(s.hintCountByPuzzle.P03_revision_diff).toBe(3);
  });
  it('빈 슬롯 제출은 오답 횟수를 올리지 않는다', () => {
    const s = createGameState();
    expect(submitPuzzle(s, 'P02_night_timeline', { t2234: ['key_lost'] }).status).toBe('incomplete');
    expect(s.wrongCountByPuzzle.P02_night_timeline ?? 0).toBe(0);
  });
  it('7. 힌트를 끝까지 써도 엔딩 A 에 도달할 수 있다', () => {
    const s = createGameState();
    ALL_EXCEPT_E16.forEach((id) => acquireEvidence(s, id));
    for (const p of puzzles) {
      for (let i = 0; i < 6; i++) submitPuzzle(s, p.id, p.slots.reduce((a, sl) => ({ ...a, [sl]: ['__wrong__'] }), {}));
      expect(submitPuzzle(s, p.id, ANSWERS[p.id]).status).toBe('solved');
      expect(s.hintCountByPuzzle[p.id]).toBe(3);
    }
    claims.forEach((c) => answer(s, c.claimId, true));
    chooseEvidencePreservation(s, true); setReportTarget(s, 'external');
    expect(resolveEnding(s).id).toBe('ending_a');
  });
  it('오답은 정답을 직접 보여주지 않는다 (충돌 문구만)', () => {
    const { r } = sub('P01_scene_rebuild', { impactPosition: ['desk_side'], finalPosition: ['desk_chair'], movedObjects: ['body', 'chair'] });
    expect(r).not.toHaveProperty('wrongSlots');
    expect(r.hint.autoFill).toBeNull();
  });
  it('이미 푼 퍼즐은 already_solved', () => {
    const s = fullState();
    expect(submitPuzzle(s, 'P01_scene_rebuild', ANSWERS.P01_scene_rebuild).status).toBe('already_solved');
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
