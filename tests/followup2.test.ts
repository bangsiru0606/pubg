import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import spec from '../art/asset-spec.json';
import audio from '../src/data/audio.json';
import characters from '../src/data/characters.json';
import map from '../src/data/map.json';
import evidence from '../src/data/evidence.json';
import real from '../src/data/dialogue.json';
import { createGameState, hasFlag, linkCandidates, puzzles, setFlag, shownEvidence } from '../src/core';
import { areas, isExamined, promptOf, showsSparkle, type Examine, type Transition } from '../src/explore/interaction';
import { clearPending, mergeWalkFrames, type ManifestEntry } from '../tools/import-generated';
import { stateBeforePuzzle } from '../tools/puzzle-sim';

type Seq = { id: string; frames: string[]; walkCycle?: string[] };
const seqs = spec.sequences as unknown as Seq[];

describe('걷기 5프레임·1/3 속도 (asset-spec 데이터)', () => {
  it('공통 규칙: 걷기 2장 → 지나가는 프레임(walk_pass) → 걷기 2장, 6fps(한 주기 0.83초)', () => {
    expect(spec.walk.cycle).toEqual(['walk_0', 'walk_1', 'walk_pass', 'walk_2', 'walk_3']);
    expect(spec.walk.fps).toBe(6); expect(spec.walk.cycle.length / spec.walk.fps).toBeCloseTo(5 / 6, 5);
  });
  it('발이 미끄러지지 않는다: 한 주기에 가는 거리 = 이동 속도 × 주기 시간 = 실제 보폭(40~50px), 달리기는 속도·fps 가 같은 배수', () => {
    const cycleSec = spec.walk.cycle.length / spec.walk.fps, perCycle = map.playerSpeed * cycleSec;
    expect(perCycle).toBeGreaterThanOrEqual(40); expect(perCycle).toBeLessThanOrEqual(50); expect(map.playerSpeed).toBe(55); // 새 그림의 접지 두 발 간격 약 20px → 주기 약 40~46px
    expect(map.runMultiplier).toBe(2); expect(map.playerSpeed * map.runMultiplier * (cycleSec / map.runMultiplier)).toBeCloseTo(perCycle, 5); // 달릴 때 주기는 절반(fps ×2), 속도 ×2 → 한 주기 거리 그대로
  });
  it('연출 속 이동(오프닝 박은호·1층 첫 입장 플레이어·백선우)도 같은 속도 규칙: 단계에 speed 를 따로 쓰지 않는다', () => {
    for (const st of [...map.opening.steps, ...(map.areas.floor1.stage?.steps ?? [])]) if (st.do === 'walk') expect(st, JSON.stringify(st)).not.toHaveProperty('speed');
  });
  it('모든 걷는 인물이 공통 순서(걷기·걷기·walk_pass·걷기·걷기)를 쓰고 그림이 실제로 있다 (인물별 walkCycle 없음)', () => {
    const walkers = seqs.filter((x) => x.frames.some((f) => f.startsWith('walk_')));
    expect(walkers.map((q) => q.id).sort()).toEqual(['baek', 'eunho', 'player']);
    for (const q of walkers) {
      expect(q.walkCycle, q.id).toBeUndefined();
      for (const f of spec.walk.cycle) expect(q.frames, `${q.id}:${f}`).toContain(f);
      expect((q as Seq & { alignFeet?: boolean }).alignFeet, q.id).toBe(true);
    }
  });
  it('한지수·박은호는 새 걷기(_v2, 박은호 walk_pass 는 _v3 최신판)를 쓰고 대기 그림은 craft_on 그대로다', () => {
    type S2 = Seq & { src: string; frameSrc: Record<string, string> };
    const p = seqs.find((q) => q.id === 'player') as S2, e = seqs.find((q) => q.id === 'eunho') as S2;
    expect(p.src).toBe('Art/Player'); expect(e.src).toBe('Art/ParkEunho');
    expect(p.frameSrc).toEqual({ walk_0: 'generated/characters/player/walk_0_v2', walk_1: 'generated/characters/player/walk_1_v2', walk_2: 'generated/characters/player/walk_2_v2', walk_3: 'generated/characters/player/walk_3_v2', walk_pass: 'generated/characters/player/walk_pass_v2' });
    expect(e.frameSrc.walk_pass).toBe('generated/characters/eunho/walk_pass_v3'); expect(e.frameSrc.walk_0).toBe('generated/characters/eunho/walk_0_v2');
    for (const f of Object.values({ ...p.frameSrc, ...e.frameSrc })) expect(existsSync(`art/source/${f}.png`), f).toBe(true);
  });
  it('백선우 걷기 5장이 들어왔다(pending 없음), 정규화는 발 하단 줄 정렬', () => {
    expect(spec.pending).toEqual([]);
    const b = seqs.find((q) => q.id === 'baek') as Seq & { alignFeet?: boolean };
    expect(b.frames).toEqual(expect.arrayContaining(['idle_0', 'walk_0', 'walk_1', 'walk_2', 'walk_3', 'walk_pass'])); expect(b.alignFeet).toBe(true);
  });
  it('걷기 그림이 들어오면 frames 에 더하고 같은 규칙이 자동 적용된다 (walk_pass 포함, 두 번 해도 그대로)', () => {
    const sp = { sequences: [{ id: 'baek', src: 'generated/characters/baek', frames: ['idle_0'], breathe: true }] } as unknown as Parameters<typeof mergeWalkFrames>[0];
    const manifest: ManifestEntry[] = ['walk_0', 'walk_1', 'walk_pass', 'walk_2', 'walk_3'].map((n) => ({ file: `characters/baek/${n}.png`, kind: 'sprite', facing: 'right', chromaKey: true }));
    const added = mergeWalkFrames(sp, manifest);
    expect(added).toEqual(['baek_walk_0', 'baek_walk_1', 'baek_walk_2', 'baek_walk_3', 'baek_walk_pass']);
    expect(mergeWalkFrames(sp, manifest)).toEqual([]);
    const pend = { pending: ['x', ...added] };
    clearPending(pend, [], manifest, added);
    expect(pend.pending).toEqual(['x']);
  });
  it('_v2 파일은 같은 이름(walk_0)의 최신판으로 인식한다: craft_on 인물은 _v2 만 바꿔 넣고(v1 파일은 무시), 5장이 모두 최신판이면 walkCycle 을 지운다', () => {
    const sp = { sequences: [{ id: 'player', src: 'Art/Player', frames: ['idle_0', 'idle_1', 'walk_0', 'walk_1', 'walk_2', 'walk_3'], walkCycle: ['walk_0', 'walk_1', 'idle_0', 'walk_2', 'walk_3'] }] } as unknown as Parameters<typeof mergeWalkFrames>[0];
    const v1: ManifestEntry[] = ['walk_0', 'walk_1', 'walk_2', 'walk_3', 'walk_pass'].map((n) => ({ file: `characters/player/${n}.png`, kind: 'sprite' }));
    expect(mergeWalkFrames(sp, v1)).toEqual([]); // v2 가 오기 전에는 지금 그림 유지
    expect(sp.sequences[0]).not.toHaveProperty('frameSrc'); expect(sp.sequences[0]).toHaveProperty('walkCycle');
    const v2: ManifestEntry[] = ['walk_0', 'walk_1', 'walk_2', 'walk_3', 'walk_pass'].map((n) => ({ file: `characters/player/${n}_v2.png`, kind: 'sprite' }));
    expect(mergeWalkFrames(sp, [...v1, ...v2])).toEqual(['player_walk_pass']);
    const q = sp.sequences[0] as unknown as Seq & { frameSrc: Record<string, string>; alignFeet: boolean };
    expect(q.frameSrc.walk_0).toBe('generated/characters/player/walk_0_v2'); expect(q.frameSrc.walk_pass).toBe('generated/characters/player/walk_pass_v2');
    expect(q).not.toHaveProperty('walkCycle'); expect(q.alignFeet).toBe(true);
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
    expect(spec.pending).not.toContain('stairs_basement_closed'); // 배치 6 에서 들어왔다
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
