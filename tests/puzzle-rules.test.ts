import { describe, expect, it } from 'vitest';
import {
  acquireEvidence, availablePieces, createGameState, isAnswerComplete, isCorrectAnswer, isPuzzleSettled, isUnsettledClue,
  pendingPuzzles, puzzleById, puzzleDraftOf, puzzles, savePuzzleDraft, setFlag, settledPuzzles, submitPuzzle, unverifiedClues, type GameState, type PuzzleAnswer,
} from '../src/core';
import { applyScene, buildProgress, failPuzzle } from '../src/explore/playthrough';
import { simulate, stateBeforePuzzle } from '../tools/puzzle-sim';

const P = (id: string) => puzzleById.get(id)!;
const wrongAnswer = (id: string): PuzzleAnswer => Object.fromEntries(P(id).slots.map((sl) => [sl, ['__wrong__']]));

describe('퍼즐 규칙 (이전계획 11.16 / 기획서 4.6): 한 번만 확정, 결과 비공개', () => {
  it('결과에는 맞고 틀림이 담기지 않는다 — 맞든 틀리든 같은 settled', () => {
    const a = stateBeforePuzzle('P04_approval_chain'), b = stateBeforePuzzle('P04_approval_chain'), p = P('P04_approval_chain');
    const right = submitPuzzle(a, p.id, p.correctSlots), wrong = submitPuzzle(b, p.id, { ...p.correctSlots, doc_selection: ['lee_hanshin'] });
    expect(right).toEqual({ status: 'settled' }); expect(wrong).toEqual({ status: 'settled' });
    for (const k of ['conflicts', 'hint', 'remaining']) { expect(right).not.toHaveProperty(k); expect(wrong).not.toHaveProperty(k); }
    // 데이터에도 충돌 문장·힌트·후보 제거가 없다
    for (const q of puzzles) for (const k of ['conflicts', 'hintTexts', 'distractors', 'pieceConflict']) expect(q).not.toHaveProperty(k);
  });
  it('확정은 한 번: 맞으면 단서가 검증되고, 틀리면 조용히 미검증으로 남으며 다시 낼 수 없다', () => {
    const s = stateBeforePuzzle('P04_approval_chain'), p = P('P04_approval_chain');
    submitPuzzle(s, p.id, { ...p.correctSlots, doc_selection: ['lee_hanshin'] });
    expect(s.failedPuzzleIds).toEqual([p.id]); expect(s.solvedPuzzleIds).not.toContain(p.id);
    expect(s.flags).toEqual(expect.arrayContaining([`puzzle_done:${p.id}`, p.flagOnSolve])); // 이야기는 맞고 틀림과 무관하게 진행
    expect(s.flags).not.toContain(`puzzle_failed:${p.id}`);
    expect(submitPuzzle(s, p.id, p.correctSlots).status).toBe('already_settled'); // 바꿀 수 없다
    expect(s.solvedPuzzleIds).not.toContain(p.id); expect(isPuzzleSettled(s, p.id)).toBe(true);
    for (const id of p.verifiedEvidenceIds) if (s.evidenceIds.includes(id)) expect(s.verifiedEvidenceIds).not.toContain(id);
  });
  it('모든 칸을 채우지 않으면 확정할 수 없고 정리한 것으로 치지 않는다', () => {
    const s = stateBeforePuzzle('P02_night_timeline');
    expect(isAnswerComplete(P('P02_night_timeline'), { t2234: ['t_out'] })).toBe(false);
    expect(submitPuzzle(s, 'P02_night_timeline', { t2234: ['t_out'] }).status).toBe('incomplete');
    expect(isPuzzleSettled(s, 'P02_night_timeline')).toBe(false); expect(s.flags).not.toContain('puzzle_done:P02_night_timeline');
  });
  it('오답 위치(문 앞·창가)나 오답 조각을 칸에 놓으면 정답이 아니다 — 놓지 않는 것이 정답', () => {
    const p = P('P01_scene_rebuild');
    expect(isCorrectAnswer(p, p.correctSlots)).toBe(true);
    expect(isAnswerComplete(p, { path: p.correctSlots.path.slice(0, 3) })).toBe(false); // 문답은 마지막 판단까지 가야 확정할 수 있다
    expect(isCorrectAnswer(p, { path: ['c1_head', 'c2_fight', 'c3_altar', 'c4_self'] })).toBe(false);
    const t = P('P02_night_timeline');
    expect(isCorrectAnswer(t, { ...t.correctSlots, t2241: ['d_sermon'] })).toBe(false);
  });
  it('보류: 놓은 조각이 저장되고 벌점이 없다. 이어서 한 번 확정한다', () => {
    const s = stateBeforePuzzle('P02_night_timeline');
    savePuzzleDraft(s, 'P02_night_timeline', { t2234: ['t_out'], t2241: [] });
    expect(puzzleDraftOf(s, 'P02_night_timeline')).toEqual({ t2234: ['t_out'] }); expect(s.wrongCountByPuzzle.P02_night_timeline).toBeUndefined();
    expect(submitPuzzle(s, 'P02_night_timeline', P('P02_night_timeline').correctSlots).status).toBe('settled');
    expect(s.solvedPuzzleIds).toContain('P02_night_timeline'); expect(s.puzzleDrafts.P02_night_timeline).toBeUndefined();
  });
  it('틀리게 정리: 단서는 검증되지 않지만 "정리함"이라 미결 목록에서 빠지고 근거로 꽂을 수 있다. 정리 전 사건의 단서는 꽂을 수 없다', () => {
    const s = buildProgress(5, { fail: ['P03_revision_diff'] }).state;
    expect(s.failedPuzzleIds).toEqual(['P03_revision_diff']);
    expect(s.verifiedEvidenceIds).not.toContain('E07_report_revision');
    expect(isUnsettledClue(s, 'E07_report_revision')).toBe(false); // 정리했다 → 꽂을 수 있다 (점수만 못 받는다)
    expect(pendingPuzzles(s).map((p) => p.id)).not.toContain('P03_revision_diff'); expect(settledPuzzles(s).map((p) => p.id)).toContain('P03_revision_diff');
    const u = unverifiedClues(s, []);
    expect(u.failed).toContain('E07_report_revision'); expect(u.open).toEqual([]);
    const late = createGameState(); failPuzzle(late, 'P05_patient_code'); acquireEvidence(late, 'E12_ledger');
    expect(late.verifiedEvidenceIds).not.toContain('E12_ledger'); expect(isUnsettledClue(late, 'E12_ledger')).toBe(false);
    const open = createGameState(); acquireEvidence(open, 'E12_ledger');
    expect(isUnsettledClue(open, 'E12_ledger')).toBe(true); // 아직 정리하지 않은 사건의 자료
  });
  it('퍼즐을 정리하면 puzzle_done 플래그, P02 는 E05·E06 을 검증하고 E05 를 나중에 얻으면 얻는 순간 검증', () => {
    const s = stateBeforePuzzle('P02_night_timeline');
    expect(s.evidenceIds).toContain('E05_access_log'); // 간호사실 재고표 (씬 4 조사)
    const s2 = createGameState();
    for (const id of ['E04_wristband_fragment']) acquireEvidence(s2, id);
    setFlag(s2, 'choi_done'); setFlag(s2, 'han_done'); setFlag(s2, 'chae_done'); setFlag(s2, 'broadcast_seen'); setFlag(s2, 'haneul_met');
    for (const id of ['choi_s_thud', 'chae_s_time', 'chae_s_out']) s2.statements[id] = { text: id, speaker: 'han_jisu', stage: 'unconfirmed' };
    expect(pendingPuzzles(s2).map((p) => p.id)).toContain('P02_night_timeline'); // E05 없이도 열린다 (22:41 은 순서로 추론)
    expect(submitPuzzle(s2, 'P02_night_timeline', P('P02_night_timeline').correctSlots).status).toBe('settled');
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
  it('무작위로 채워 한 번 확정해 우연히 맞을 확률은 퍼즐마다 5% 미만이다', () => {
    for (const p of puzzles) expect(simulate(p.id, { trials: 3000 }).rate, p.id).toBeLessThan(0.05);
  });
  it('모든 퍼즐의 정답은 완전한 답이고 이야기를 진행한다 (정답 5종 해결)', () => {
    const s: GameState = buildProgress(7).state;
    expect(s.solvedPuzzleIds).toHaveLength(5);
    for (const p of puzzles) expect(s.flags).toContain(`puzzle_done:${p.id}`);
    applyScene(createGameState(), 2, true, { puzzles: false });
  });
  it('wrongAnswer 헬퍼: 칸을 모두 채운 오답을 한 번 내면 틀리게 정리', () => {
    const s = stateBeforePuzzle('P03_revision_diff');
    submitPuzzle(s, 'P03_revision_diff', wrongAnswer('P03_revision_diff'));
    expect(s.failedPuzzleIds).toContain('P03_revision_diff');
  });
  it('모든 퍼즐을 틀리게 정리해도 모든 질문이 열리고 퍼즐 플래그가 선다 (진행이 막히지 않는다)', () => {
    const s = buildProgress(7, { fail: puzzles.map((p) => p.id) }).state;
    expect(s.failedPuzzleIds).toHaveLength(5); expect(s.solvedPuzzleIds).toHaveLength(0);
    for (const p of puzzles) expect(s.flags).toEqual(expect.arrayContaining([`puzzle_done:${p.id}`, p.flagOnSolve]));
  });
});
