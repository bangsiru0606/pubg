import { describe, expect, it } from 'vitest';
import { condMet, pendingPuzzles, puzzleReady, puzzles, resolveEnding } from '../src/core';
import { areas } from '../src/explore/interaction';
import { buildProgress } from '../src/explore/playthrough';

const req = (area: string, id: string) => (areas[area].interactables.find((i) => i.id === id) as { requires: string }).requires;

describe('진행 막힘 검사: 퍼즐을 하나도 풀지 않아도(P05 제외) 이야기가 끝까지 이어진다', () => {
  it('층 이동은 이야기 사건만으로 열린다 (퍼즐 0개 해결)', () => {
    const at = (n: number) => buildProgress(n, { puzzles: false }).state;
    expect(condMet(at(2), req('floor1', 'stairs_up'))).toBe(false); // 손목띠를 얻기 전
    expect(condMet(at(3), req('floor1', 'stairs_up'))).toBe(true); // 씬 2(원장실) 뒤 — P01 은 풀지 않았다
    expect(condMet(at(3), req('floor2', 'stairs_up'))).toBe(false);
    expect(condMet(at(4), req('floor2', 'stairs_up'))).toBe(true); // 정하늘·채소연 대화 뒤
    expect(condMet(at(4), req('floor1', 'stairs_b1'))).toBe(false);
    expect(condMet(at(5), req('floor1', 'stairs_b1'))).toBe(true); // 오미란의 열쇠
    for (const n of [3, 4, 5, 6]) expect(at(n).solvedPuzzleIds, `씬 ${n}`).toEqual([]);
  });
  it('P05 만 이야기 진행에 필요하다: 재료는 지하 조사만으로 모이고, 다른 퍼즐은 수첩의 미결 사건에 남는다', () => {
    const s = buildProgress(6, { puzzles: false }).state; // 씬 5 까지(P05 포함) 풀지 않은 상태
    expect(s.evidenceIds).toEqual(expect.arrayContaining(['E12_ledger', 'E13_identity_map', 'E14_belongings_diary', 'E15_transport_manifest']));
    expect(puzzleReady(s, puzzles.find((p) => p.id === 'P05_patient_code')!)).toBe(true);
    expect(pendingPuzzles(s).map((p) => p.id)).toEqual(expect.arrayContaining(['P01_scene_rebuild', 'P02_night_timeline', 'P03_revision_diff', 'P04_approval_chain', 'P05_patient_code']));
  });
  it('퍼즐을 풀지 않아도 보고서까지 가서 엔딩이 정해진다 (결론 없음 = 엔딩 D)', () => {
    const s = buildProgress(7, { puzzles: false }).state;
    expect(resolveEnding(s).id).toBe('ending_d');
  });
});

describe('P05 를 틀리게 정리한 경로: 정하늘 등장 → 보고서', () => {
  it('P05 를 틀리게 정리해도 정하늘이 등장하고 고백·증거 보존 선택·보고서로 이어진다 (결과를 드러내는 분기 대사 없음)', async () => {
    const { failPuzzle } = await import('../src/explore/playthrough');
    const { autoTriggered } = await import('../src/explore/interaction');
    const { nextOf, enterNode } = await import('../src/core');
    const real = (await import('../src/data/dialogue.json')).default.dialogues as never as import('../src/core').Dialogues;
    const s = buildProgress(5, { puzzles: false }).state; // 지하 입장, P05 재료는 아직
    for (const id of ['E12_ledger', 'E13_identity_map', 'E14_belongings_diary', 'E15_transport_manifest']) if (!s.evidenceIds.includes(id)) s.evidenceIds.push(id);
    s.flags.push('diary_closed');
    expect(autoTriggered('b1', areas.b1, 400, s)).toBeNull(); // 정리하지도 않았다
    failPuzzle(s, 'P05_patient_code');
    expect(s.failedPuzzleIds).toContain('P05_patient_code'); expect(s.flags).toContain('puzzle_done:P05_patient_code');
    expect(autoTriggered('b1', areas.b1, 400, s)?.id).toBe('haneul_b1');
    const D = real.jeong_haneul_final.nodes;
    expect(D.f2x).toBeUndefined(); expect(D.f3x).toBeUndefined(); // 실패 분기 대사는 없다
    expect(nextOf(s, D.f1)).toBe('f2'); expect(nextOf(s, D.f3)).toBe('f4');
    expect(JSON.stringify(real)).not.toContain('확정하지는 못했');
    for (const n of Object.values(D)) enterNode(s, n); // 고백 끝
    expect(s.flags).toContain('haneul_confessed');
    expect(autoTriggered('b1', areas.b1, 400, s)?.id).toBe('scene6'); // 증거 보존 선택 → 보고서
    expect(resolveEnding(s).id).toBe('ending_d');
  });
  it('P05 를 맞게 정리해도 정하늘 대사는 같다 (맞고 틀림에 따른 분기 없음)', async () => {
    const { nextOf } = await import('../src/core');
    const real = (await import('../src/data/dialogue.json')).default.dialogues as never as import('../src/core').Dialogues;
    const s = buildProgress(6).state;
    expect(nextOf(s, real.jeong_haneul_final.nodes.f1)).toBe('f2');
  });

});
