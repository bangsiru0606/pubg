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
