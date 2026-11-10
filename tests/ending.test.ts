import { describe, expect, it } from 'vitest';
import {
  acquireEvidence, canSaveConclusion, clearConclusion, createGameState, evidenceList, findConflicts, puzzles,
  resolveEnding, resolveEndingLines, saveConclusion, submitPuzzle, claimById, type GameState,
} from '../src/core';

const GOOD: Record<string, [string[], string[]]> = {
  claim_a: [['E02_altar_blood', 'E03_preliminary_exam'], ['E07_report_revision']],
  claim_b: [['E04_wristband_fragment', 'E08_miran_revised'], ['E05_access_log']],
  claim_c: [['E07_report_revision', 'E08_miran_revised'], ['E06_torn_sleeve']],
  claim_d: [['E12_ledger', 'E14_belongings_diary'], ['E15_transport_manifest']],
};
const ids = ['claim_a', 'claim_b', 'claim_c', 'claim_d'];

function build(solvedMask: number, secured: boolean, external: boolean): GameState {
  const s = createGameState();
  evidenceList.filter((e) => e.id !== 'E16_secure_receipt').forEach((e) => acquireEvidence(s, e.id));
  puzzles.forEach((p) => submitPuzzle(s, p.id, p.correctSlots));
  ids.forEach((c, i) => {
    const good = (solvedMask >> i) & 1;
    const hyp = claimById.get(c)!.hypotheses.filter((h) => h.isCorrect === !!good)[0].id;
    expect(saveConclusion(s, c, hyp, ...(good ? GOOD[c] : [[], []] as [string[], string[]])).ok).toBe(true);
  });
  s.evidenceSecured = secured;
  s.reportTarget = external ? 'external' : 'eunho_only';
  return s;
}

/** 규칙 표 (docs/이전계획.md "판정 규칙 확정") — 구현과 독립적으로 다시 쓴 기대값 */
function expected(mask: number, secured: boolean, external: boolean): string {
  const A = !!(mask & 1), B = !!(mask & 2), C = !!(mask & 4), D = !!(mask & 8);
  const unsolved = 4 - [A, B, C, D].filter(Boolean).length;
  if (unsolved === 0 && secured && external) return 'ending_a';
  if (A && B && !C && !D) return 'ending_b';
  if (unsolved >= 2 || !A) return 'ending_d';
  if (unsolved <= 1 && (!secured || !external)) return 'ending_c';
  return 'ending_b';
}

describe('엔딩 64조합 (해결 16 × 보존 2 × 보고 2)', () => {
  const tally: Record<string, number> = {};
  for (let mask = 0; mask < 16; mask++) for (const secured of [false, true]) for (const external of [false, true]) {
    it(`solved=${mask.toString(2).padStart(4, '0')} secured=${secured} external=${external}`, () => {
      const s = build(mask, secured, external);
      const got = resolveEnding(s).id;
      expect(got).toBe(expected(mask, secured, external));
      tally[got] = (tally[got] ?? 0) + 1;

      // 12.2.5 결과 세 줄이 조건과 모순되지 않는다
      const L = resolveEndingLines(s);
      const [, B, C, D] = [0, 1, 2, 3].map((i) => !!((mask >> i) & 1));
      const eff = secured && external;
      // 정하늘
      if (B) expect(L.haneul.text).not.toContain('무단 침입만');
      else expect(L.haneul.text).toBe('병원은 원장 자연사와 정하늘의 무단 침입만 발표한다.');
      if (!B || !eff) expect(L.haneul.text).not.toContain('함께 제출된다');
      if (B && !C && !D) expect(L.haneul.text).toContain('원장 살해범으로 넘긴다');
      else expect(L.haneul.text).not.toContain('살해범으로 넘긴다');
      // 조직
      if (C) expect(L.organization.text).not.toMatch(/개인의 원한|신뢰받지 못/);
      if (!C) expect(L.organization.text).not.toContain('백선우와 이혜정은');
      if (eff && (C || D)) expect(L.organization.text).toContain('환자 이송을 중단');
      else expect(L.organization.text).not.toContain('환자 이송을 중단');
      if (!secured && (C || D)) expect(L.organization.text).toContain('임시 폐쇄');
      else expect(L.organization.text).not.toContain('임시 폐쇄');
      if (!C && !D && B) expect(L.organization.text).toContain('개인의 원한');
      // 박은호
      if (D) expect(L.eunho.text).not.toMatch(/끝내 확인하지 못한다|불완전한 자료/);
      else expect(L.eunho.text).not.toMatch(/죽음을|일기의? 사본|유품을 인도/);
      if (D && !secured) expect(L.eunho.text).toContain('일기 사본');
      if (D && eff) expect(L.eunho.text).toContain('유품을 인도받기 위한 절차');
      // 증거 미보존이면 '보존/외부에 보존' 언급·수사 착수 문장이 나오지 않는다
      if (!secured) for (const k of ['haneul', 'organization', 'eunho'] as const) expect(L[k].text).not.toMatch(/외부 수사팀이 도착|병원 밖에 보존/);
    });
  }
  it('집계: A 1 / B 7 / C 12 / D 44', () => {
    expect([tally.ending_a, tally.ending_b, tally.ending_c, tally.ending_d]).toEqual([1, 7, 12, 44]);
  });
});

describe('반박 슬롯·보류·충돌 경고', () => {
  it('반박 슬롯이 비면 저장 불가, 채우면 가능 (정답 여부와 무관)', () => {
    expect(canSaveConclusion('a3_collision', [])).toBe(false);
    expect(canSaveConclusion(null, ['E07_report_revision'])).toBe(false);
    expect(canSaveConclusion('a1_natural', ['E01_last_letter'])).toBe(true);
  });
  it('보류는 저장된 결론을 지운다', () => {
    const s = build(0b1111, true, true);
    clearConclusion(s, 'claim_a');
    expect(s.selectedHypothesisByClaim.claim_a).toBeUndefined();
  });
  it('충돌 경고는 conflicts.json 에 명시한 쌍만, 정답 제출 조합에서는 경고 없음', () => {
    expect(findConflicts(['E03_preliminary_exam', 'E08_miran_revised'])).toEqual([]); // 자동 추론 없음: E03/E08 은 서로 뒷받침한다
    expect(findConflicts(['x', 'y', 'z'], [['x', 'y']])).toEqual([['x', 'y']]); // 명시한 쌍만
    expect(findConflicts(['x', 'z'], [['x', 'y']])).toEqual([]);
    for (const [sup, reb] of Object.values(GOOD)) expect(findConflicts([...sup, ...reb])).toEqual([]);
  });
});
