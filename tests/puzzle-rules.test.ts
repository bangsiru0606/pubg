import { describe, expect, it } from 'vitest';
import {
  MAX_ATTEMPTS, acquireEvidence, attemptsLeft, availablePieces, createGameState, failedVerifierOf, hintFor, hintLevelFor, isAnswerComplete, isCorrectAnswer, isVerificationFailed,
  pendingPuzzles, puzzleById, puzzleDraftOf, puzzles, savePuzzleDraft, setFlag, submitPuzzle, unverifiedClues, type GameState, type PuzzleAnswer,
} from '../src/core';
import { applyScene, buildProgress, failPuzzle } from '../src/explore/playthrough';
import { simulate, stateBeforePuzzle } from '../tools/puzzle-sim';

const P = (id: string) => puzzleById.get(id)!;
const wrongAnswer = (id: string): PuzzleAnswer => Object.fromEntries(P(id).slots.map((sl) => [sl, ['__wrong__']]));

describe('퍼즐 규칙 (이전계획 11.12 / 기획서 4.6): 결론 기회 3번', () => {
  it('힌트 단계: 1번째 오답 = 힌트 문장, 2번째 오답 = 틀린 후보 제거 (칸을 채워 주는 힌트는 없다)', () => {
    expect([0, 1, 2, 3].map(hintLevelFor)).toEqual([0, 1, 2, 2]);
    for (const p of puzzles) {
      expect(p.hintTexts).toHaveLength(2);
      expect(hintFor(p, 1)).toEqual({ level: 1, text: p.hintTexts[0], removedTokens: [] });
      expect(hintFor(p, 2).removedTokens).toEqual([p.distractors[0]]);
      expect(hintFor(p, 2)).not.toHaveProperty('autoFill');
    }
  });
  it('오답마다 충돌 문장은 하나, 3번째 오답에서 검증 실패로 닫힌다', () => {
    const s = stateBeforePuzzle('P04_approval_chain');
    const p = P('P04_approval_chain');
    const wrong = { ...p.correctSlots, doc_selection: ['lee_hanshin'] };
    const r1 = submitPuzzle(s, p.id, wrong);
    expect(r1.status).toBe('wrong'); expect(r1.conflicts).toHaveLength(1); expect(r1.remaining).toBe(2); expect(r1.hint.level).toBe(1);
    const r2 = submitPuzzle(s, p.id, wrong);
    expect(r2.status).toBe('wrong'); expect(r2.remaining).toBe(1); expect(r2.hint.removedTokens).toEqual(['*:oh_miran']);
    const r3 = submitPuzzle(s, p.id, wrong);
    expect(r3.status).toBe('failed'); expect(r3.remaining).toBe(0);
    expect(s.failedPuzzleIds).toEqual([p.id]); expect(s.flags).toEqual(expect.arrayContaining([`puzzle_done:${p.id}`, `puzzle_failed:${p.id}`]));
    expect(submitPuzzle(s, p.id, p.correctSlots).status).toBe('closed'); // 다시 열 수 없다
    expect(s.solvedPuzzleIds).not.toContain(p.id);
  });
  it('모든 칸을 채우지 않으면 확정할 수 없고 기회는 줄지 않는다', () => {
    const s = stateBeforePuzzle('P02_night_timeline');
    expect(isAnswerComplete(P('P02_night_timeline'), { t2234: ['t_out'] })).toBe(false);
    expect(submitPuzzle(s, 'P02_night_timeline', { t2234: ['t_out'] }).status).toBe('incomplete');
    expect(attemptsLeft(s, 'P02_night_timeline')).toBe(MAX_ATTEMPTS);
  });
  it('오답 위치(문 앞·창가)나 오답 조각을 칸에 놓으면 정답이 아니다 — 놓지 않는 것이 정답', () => {
    const p = P('P01_scene_rebuild');
    expect(isCorrectAnswer(p, p.correctSlots)).toBe(true);
    expect(isAnswerComplete(p, { path: p.correctSlots.path.slice(0, 3) })).toBe(false); // 문답은 마지막 판단까지 가야 확정할 수 있다
    expect(isCorrectAnswer(p, { path: ['c1_head', 'c2_fight', 'c3_altar', 'c4_self'] })).toBe(false);
    const t = P('P02_night_timeline');
    expect(isCorrectAnswer(t, { ...t.correctSlots, t2241: ['d_sermon'] })).toBe(false);
  });
  it('조각 충돌 문장은 자료 이름으로 말하고 정답 위치는 말하지 않는다', () => {
    const s = stateBeforePuzzle('P01_scene_rebuild'), p = P('P01_scene_rebuild');
    const r = submitPuzzle(s, p.id, { path: ['c1_head', 'c2_seizure', 'c3_altar', 'c4_moved'] });
    expect(r.status).toBe('wrong'); expect(r.conflicts[0]).toContain('찢어진 손목띠 조각'); expect(r.conflicts[0]).not.toContain('몸싸움');
  });
  it('보류: 놓은 조각이 저장되고 기회는 줄지 않는다. 틀린 답도 그대로 남아 이어서 고친다', () => {
    const s = stateBeforePuzzle('P02_night_timeline');
    savePuzzleDraft(s, 'P02_night_timeline', { t2234: ['t_out'], t2241: [] });
    expect(puzzleDraftOf(s, 'P02_night_timeline')).toEqual({ t2234: ['t_out'] }); expect(attemptsLeft(s, 'P02_night_timeline')).toBe(3);
    submitPuzzle(s, 'P02_night_timeline', { t2234: ['t_door'], t2241: ['t_out'], t2246: ['t_thud'], t2251: ['t_time'] });
    expect(puzzleDraftOf(s, 'P02_night_timeline').t2234).toEqual(['t_door']); expect(attemptsLeft(s, 'P02_night_timeline')).toBe(2);
    expect(submitPuzzle(s, 'P02_night_timeline', P('P02_night_timeline').correctSlots).status).toBe('solved');
    expect(s.puzzleDrafts.P02_night_timeline).toBeUndefined();
  });
  it('검증 실패: 관련 단서는 검증되지 않고(신빙성 낮음), 늦게 얻어도 검증되지 않으며, 미결 목록에서 빠진다', () => {
    const s = buildProgress(5, { fail: ['P03_revision_diff'] }).state;
    expect(s.failedPuzzleIds).toEqual(['P03_revision_diff']);
    expect(isVerificationFailed(s, 'E07_report_revision')).toBe(true); expect(failedVerifierOf(s, 'E07_report_revision')!.id).toBe('P03_revision_diff');
    expect(s.verifiedEvidenceIds).not.toContain('E07_report_revision');
    expect(pendingPuzzles(s).map((p) => p.id)).not.toContain('P03_revision_diff');
    const u = unverifiedClues(s, []);
    expect(u.failed).toContain('E07_report_revision'); expect(u.open).toEqual([]);
    const late = createGameState(); failPuzzle(late, 'P05_patient_code'); acquireEvidence(late, 'E12_ledger');
    expect(late.verifiedEvidenceIds).not.toContain('E12_ledger'); expect(isVerificationFailed(late, 'E12_ledger')).toBe(true);
  });
  it('퍼즐이 풀리면 puzzle_done 플래그, P02 는 E05·E06 을 검증하고 E05 를 나중에 얻으면 얻는 순간 검증', () => {
    const s = stateBeforePuzzle('P02_night_timeline');
    expect(s.evidenceIds).toContain('E05_access_log'); // 간호사실 재고표 (씬 4 조사)
    const s2 = createGameState();
    for (const id of ['E04_wristband_fragment']) acquireEvidence(s2, id);
    setFlag(s2, 'choi_done'); setFlag(s2, 'han_done'); setFlag(s2, 'chae_done'); setFlag(s2, 'broadcast_seen'); setFlag(s2, 'haneul_met');
    for (const id of ['choi_s_thud', 'chae_s_time', 'chae_s_out']) s2.statements[id] = { text: id, speaker: 'han_jisu', stage: 'unconfirmed' };
    expect(pendingPuzzles(s2).map((p) => p.id)).toContain('P02_night_timeline'); // E05 없이도 열린다 (22:41 은 순서로 추론)
    expect(submitPuzzle(s2, 'P02_night_timeline', P('P02_night_timeline').correctSlots).status).toBe('solved');
    expect(s2.flags).toContain('puzzle_done:P02_night_timeline');
    acquireEvidence(s2, 'E05_access_log');
    expect(s2.verifiedEvidenceIds).toContain('E05_access_log');
  });
  it('조각은 가진 자료만 나타난다 (출처 단서·진술, 대화 출처는 그 플래그)', () => {
    const s = createGameState();
    expect(availablePieces(s, P('P02_night_timeline'))).toEqual([]);
    const ready = stateBeforePuzzle('P02_night_timeline');
    expect(availablePieces(ready, P('P02_night_timeline')).map((t) => t.id).sort()).toEqual(['d_prayer', 'd_sermon', 't_door', 't_out', 't_thud', 't_time']);
  });
  it('무작위 제출로 3번 안에 우연히 풀릴 확률은 퍼즐마다 5% 미만이다', () => {
    for (const p of puzzles) expect(simulate(p.id, { trials: 3000 }).rate, p.id).toBeLessThan(0.05);
  });
  it('모든 퍼즐의 정답은 완전한 답이고 이야기를 진행한다 (정답 5종 해결)', () => {
    const s: GameState = buildProgress(7).state;
    expect(s.solvedPuzzleIds).toHaveLength(5);
    for (const p of puzzles) expect(s.flags).toContain(`puzzle_done:${p.id}`);
    applyScene(createGameState(), 2, true, { puzzles: false });
  });
  it('wrongAnswer 헬퍼: 칸을 모두 채운 오답을 3번 내면 검증 실패', () => {
    const s = stateBeforePuzzle('P03_revision_diff');
    for (let i = 0; i < 3; i++) submitPuzzle(s, 'P03_revision_diff', wrongAnswer('P03_revision_diff'));
    expect(s.failedPuzzleIds).toContain('P03_revision_diff');
  });
});
