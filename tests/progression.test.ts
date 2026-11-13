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

describe('대화 진행 막힘 검사 (4차 피드백 5: 오미란 열쇠)', () => {
  const load = async () => {
    const core = await import('../src/core');
    const real = (await import('../src/data/dialogue.json')).default.dialogues as never as import('../src/core').Dialogues;
    return { ...core, real, D: real.oh_miran };
  };
  /** node 부터 next 를 따라가며 진입 효과를 적용한다 (선택지·제시가 필요한 곳에서 멈춘다) */
  const run = (m: Awaited<ReturnType<typeof load>>, s: import('../src/core').GameState, from: string) => {
    let id: string | undefined = from, last = from;
    while (id) { const n = m.D.nodes[id]; m.enterNode(s, n); last = id; id = m.nextOf(s, n); }
    return last;
  };
  it('오미란 대화를 중간에 끊었다 다시 와도 열쇠까지 간다 (재제시가 막히지 않고, 끊은 대목에서 다시 시작한다)', async () => {
    const m = await load(), s = m.createGameState();
    for (const id of ['E03_preliminary_exam', 'E04_wristband_fragment', 'E06_torn_sleeve', 'E11_transfer_order']) m.acquireEvidence(s, id);
    expect(m.openingNodeOf(s, m.D, 'oh_miran')).toBe('o0');
    expect(run(m, s, 'o0')).toBe('o1'); m.markDialogueDone(s, m.D, 'oh_miran'); // o1 에서 제시 없이 끊는다
    expect(m.openingNodeOf(s, m.D, 'oh_miran')).toBe('o1'); // 처음(o0)이 아니라 끊은 대목
    expect(m.presentEvidence(s, m.D, 'oh_miran', 'o1', ['E03_preliminary_exam']).kind).toBe('ok');
    expect(run(m, s, 'o2')).toBe('o3'); m.markDialogueDone(s, m.D, 'oh_miran'); // o3 에서 또 끊는다
    expect(m.openingNodeOf(s, m.D, 'oh_miran')).toBe('o3');
    expect(m.presentEvidence(s, m.D, 'oh_miran', 'o3', ['E04_wristband_fragment']).kind).toBe('ok');
    expect(run(m, s, 'o4')).toBe('o8'); m.markDialogueDone(s, m.D, 'oh_miran'); // o8 에서 끊는다
    expect(m.openingNodeOf(s, m.D, 'oh_miran')).toBe('o8');
    expect(m.presentEvidence(s, m.D, 'oh_miran', 'o8', ['E11_transfer_order']).kind).toBe('ok');
    expect(run(m, s, 'o9')).toBe('o11'); expect(s.flags).toContain('basement_key'); // 열쇠
    // 이미 맞게 낸 단서를 같은 대목에서 다시 내도 다음으로 진행한다 (영영 막히지 않는다)
    expect(m.presentEvidence(s, m.D, 'oh_miran', 'o8', ['E11_transfer_order']).kind).toBe('ok');
    expect(m.presentEvidence(s, m.D, 'oh_miran', 'o3', ['E04_wristband_fragment', 'E06_torn_sleeve']).kind).toBe('ok');
  });
  it('E04 하나만 제시해도 된다 (E06 이 없어도 열쇠까지 간다)', async () => {
    const m = await load(), s = m.createGameState();
    for (const id of ['E03_preliminary_exam', 'E04_wristband_fragment', 'E11_transfer_order']) m.acquireEvidence(s, id); // E06 없음
    expect(m.presentEvidence(s, m.D, 'oh_miran', 'o1', ['E03_preliminary_exam']).kind).toBe('ok'); run(m, s, 'o2');
    expect(m.presentEvidence(s, m.D, 'oh_miran', 'o3', ['E04_wristband_fragment']).kind).toBe('ok'); run(m, s, 'o4');
    expect(m.presentEvidence(s, m.D, 'oh_miran', 'o8', ['E11_transfer_order']).kind).toBe('ok'); run(m, s, 'o9');
    expect(s.flags).toContain('basement_key');
  });
  it('제시를 기다리는 모든 대목은 규칙의 다음 노드가 있고, 끊어도 처음부터 또는 같은 대목에서 다시 닿는다', async () => {
    const real = (await import('../src/data/dialogue.json')).default.dialogues as never as import('../src/core').Dialogues;
    for (const [id, d] of Object.entries(real)) for (const [nid, n] of Object.entries(d.nodes)) {
      if (!n.present?.length) continue;
      for (const r of n.present) expect(d.nodes[r.next], `${id}/${nid} → ${r.next}`).toBeDefined();
      const reach = (): boolean => { const seen = new Set<string>(); let c: string | undefined = d.start; while (c && !seen.has(c)) { if (c === nid) return true; seen.add(c); c = d.nodes[c].next; } return false; };
      expect(reach() || (d.restart ?? []).some((r) => r.node === nid), `${id}/${nid} 에 다시 닿을 수 있다`).toBe(true);
    }
  });
});

describe('모든 퍼즐을 틀리게 정리해도 엔딩까지 간다 (4차 피드백 1)', () => {
  it('씬 7 까지 모든 퍼즐이 틀려도 정하늘·보고서·엔딩으로 이어진다', () => {
    const { state: s } = buildProgress(7, { fail: puzzles.map((p) => p.id) });
    expect(s.solvedPuzzleIds).toEqual([]); expect(s.failedPuzzleIds).toHaveLength(5);
    expect(s.flags).toEqual(expect.arrayContaining(['flag_claim_d_open', 'haneul_confessed']));
    expect(['ending_a', 'ending_b', 'ending_c', 'ending_d']).toContain(resolveEnding(s).id);
  });
});
