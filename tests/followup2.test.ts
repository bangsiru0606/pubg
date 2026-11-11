import { describe, expect, it } from 'vitest';
import spec from '../art/asset-spec.json';
import audio from '../src/data/audio.json';
import characters from '../src/data/characters.json';
import evidence from '../src/data/evidence.json';
import real from '../src/data/dialogue.json';
import { createGameState, hasFlag, linkCandidates, puzzles, setFlag, shownEvidence } from '../src/core';
import { areas, isExamined, promptOf, showsSparkle, type Examine, type Transition } from '../src/explore/interaction';
import { clearPending, mergeWalkFrames, type ManifestEntry } from '../tools/import-generated';
import { stateBeforePuzzle } from '../tools/puzzle-sim';

type Seq = { id: string; frames: string[]; walkCycle?: string[] };
const seqs = spec.sequences as unknown as Seq[];

describe('걷기 5프레임·1/3 속도 (asset-spec 데이터)', () => {
  it('공통 규칙: 걷기 2장 → 서 있는 프레임 → 걷기 2장, 예전 8fps 의 1/3', () => {
    expect(spec.walk.cycle).toEqual(['walk_0', 'walk_1', 'idle_0', 'walk_2', 'walk_3']);
    expect(spec.walk.fps).toBeCloseTo(8 / 3, 0); expect(spec.walk.fps).toBeLessThan(3);
  });
  it('모든 걷는 인물의 순서는 걷기·걷기·idle_0·걷기·걷기이고 그림이 실제로 있다 (박은호는 보폭이 큰 4장)', () => {
    for (const q of seqs.filter((x) => x.frames.some((f) => f.startsWith('walk_')))) {
      const cycle = q.walkCycle ?? spec.walk.cycle;
      expect(cycle, q.id).toHaveLength(5); expect(cycle[2], q.id).toBe('idle_0');
      for (const [i, f] of cycle.entries()) { expect(q.frames, `${q.id}:${f}`).toContain(f); if (i !== 2) expect(f).toMatch(/^walk_\d$/); }
      expect(new Set(cycle.filter((f) => f !== 'idle_0')).size, q.id).toBe(4);
    }
    expect(seqs.find((q) => q.id === 'eunho')!.walkCycle).toEqual(['walk_0', 'walk_1', 'idle_0', 'walk_3', 'walk_4']);
    expect(seqs.find((q) => q.id === 'player')!.walkCycle).toBeUndefined(); // 한지수: walk_0, walk_1, idle_0, walk_2, walk_3
  });
  it('백선우 걷기 그림은 pending 이고, 들어오면 같은 규칙이 자동 적용된다', () => {
    for (const n of [0, 1, 2, 3]) expect(spec.pending).toContain(`baek_walk_${n}`);
    const sp = { sequences: [{ id: 'baek', frames: ['idle_0'], breathe: true }] } as unknown as Parameters<typeof mergeWalkFrames>[0];
    const manifest: ManifestEntry[] = [0, 1, 2, 3].map((n) => ({ file: `characters/baek/walk_${n}.png`, kind: 'sprite', facing: 'right', chromaKey: true }));
    const added = mergeWalkFrames(sp, manifest);
    expect(added).toEqual(['baek_walk_0', 'baek_walk_1', 'baek_walk_2', 'baek_walk_3']);
    expect((sp.sequences[0] as unknown as Seq).frames).toEqual(['idle_0', 'walk_0', 'walk_1', 'walk_2', 'walk_3']);
    const pend = { pending: ['floor_plan_board', ...added] };
    clearPending(pend, [], manifest, added);
    expect(pend.pending).toEqual(['floor_plan_board']);
    expect(mergeWalkFrames(sp, manifest)).toEqual([]); // 두 번 적용해도 그대로
  });
});

describe('대화 초상 방향', () => {
  const chars = characters.characters as { id: string; portrait: string | null; portraitFacing?: string }[];
  it('초상이 있는 인물은 모두 원래 보는 방향 데이터가 있다 (원본 그림은 고치지 않는다)', () => {
    for (const c of chars.filter((x) => x.portrait)) expect(['left', 'right', 'front'], c.id).toContain(c.portraitFacing);
    for (const id of ['han_jisu', 'park_eunho', 'jeong_haneul']) expect(chars.find((c) => c.id === id)!.portraitFacing).toBe('left');
  });
});

describe('원장실 의자 조사 → P01 이동 대상 근거', () => {
  const chair = () => areas.room_director.interactables.find((i) => i.id === 'chair') as Examine;
  it('의자는 조사 지점이고 독백(voice inner)·관찰 카드(한지수)를 준다, 새 단서 ID 는 없다', () => {
    expect(chair()).toMatchObject({ type: 'examine', dialogueId: 'mono_chair', art: 'director_chair', doneFlag: 'chair_checked' });
    expect((areas.room_director.objects ?? []).some((o) => o.id === 'chair')).toBe(false); // 같은 그림을 두 번 그리지 않는다
    const n = (real.dialogues as unknown as Record<string, { nodes: Record<string, Record<string, unknown>> }>).mono_chair.nodes.m;
    expect(n).toMatchObject({ speaker: 'han_jisu', voice: 'inner', source: 'new', statement: { id: 'han_o_chair' } });
    expect(String(n.text)).toContain('긁혀');
    expect(evidence.length).toBe(16);
  });
  it('끌린 자국은 E04·손목띠 독백에서 지웠다', () => {
    const e04 = (evidence as unknown as { id: string; body?: string[] }[]).find((e) => e.id === 'E04_wristband_fragment')!;
    expect(JSON.stringify(e04.body)).not.toContain('긁힌');
    expect((real.dialogues as unknown as Record<string, { nodes: Record<string, { text: string }> }>).mono_wristband.nodes.m.text).not.toContain('긁힌');
    expect(shownEvidence(createGameState(), 'E04_wristband_fragment')!.body).toEqual(['정ㅎ / 2병동 / 04']);
  });
  it('P01 은 의자를 조사해야 열리고, 조사 전에는 반짝임이 보인다', () => {
    const p = puzzles.find((q) => q.id === 'P01_scene_rebuild')!;
    expect(p.openWhen?.flags).toContain('chair_checked');
    const s = createGameState();
    expect(showsSparkle(chair(), s)).toBe(true); expect(isExamined(chair(), s)).toBe(false);
    setFlag(s, 'chair_checked');
    expect(isExamined(chair(), s)).toBe(true); expect(showsSparkle(chair(), s)).toBe(false);
    expect(hasFlag(s, 'chair_checked')).toBe(true);
  });
  it('이동 대상 칸의 허용 근거는 의자 관찰 카드와 E03 (시신 이동은 E03 의 위치와 공식 설명의 차이)', () => {
    const p = puzzles.find((q) => q.id === 'P01_scene_rebuild')!;
    expect(p.evidenceLinks!.movedObjects).toEqual(['han_o_chair', 'E03_preliminary_exam']);
    const s = stateBeforePuzzle(p.id);
    expect(linkCandidates(s).find((c) => c.id === 'han_o_chair')!.title).toMatch(/의 관찰$/);
  });
});

describe('지하 철창문 열림/닫힘·맵 끝·나가기 표시', () => {
  it('stairs_b1 은 잠겨 있을 때 닫힌 그림(artLocked, pending), 열리면 stairs_basement, 열리는 순간 gate_clank', () => {
    const t = areas.floor1.interactables.find((i) => i.id === 'stairs_b1') as Transition;
    expect(t).toMatchObject({ art: 'stairs_basement', artLocked: 'stairs_basement_closed', sfx: 'onGate', lockedSfx: 'onGate' });
    expect(spec.pending).toContain('stairs_basement_closed');
    expect((audio.sfx.nodeEvents as Record<string, string>)['mono_basement_open:m']).toBe('onGate');
  });
  it('계단이 있는 구역은 걸을 수 있는 범위(walk)가 계단 앞(가운데)까지이고, 그 밖 벽·바닥 범위 바깥은 카메라 여유만큼 검다', () => {
    const W = { floor1: [0, 1620], floor2: [0, 1350], floor3: [0, 945], b1: [0, 945] } as const;
    for (const [id, [lo, hi]] of Object.entries(W)) {
      const a = areas[id];
      expect(a.walk, id).toEqual({ min: lo, max: hi }); expect(a.walk!.min).toBeGreaterThanOrEqual(a.minX); expect(a.walk!.max).toBeLessThanOrEqual(a.maxX);
      for (const it of a.interactables) if (it.type === 'transition' && it.kind === 'stairs') expect(it.x >= a.walk!.min && it.x <= a.walk!.max, `${id}/${it.id}`).toBe(true); // 계단 앞까지 갈 수 있다
    }
  });
  it('문 프롬프트: 사무실 "[사무실] 나가기", 방 출구도 "나가기"', () => {
    const office = areas.office.interactables.find((i) => i.id === 'door_out') as Transition;
    expect(office.label).toBe('[사무실] 나가기'); expect(promptOf(office)).toEqual({ label: '[사무실] 나가기', action: '나가기' });
    expect(promptOf(areas.room_oh.interactables.find((i) => i.id === 'exit') as Transition).action).toBe('나가기');
    expect(promptOf(areas.floor2.interactables.find((i) => i.id === 'door_201') as Transition).action).toBe('들어가기');
  });
});
