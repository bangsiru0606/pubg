import { describe, expect, it } from 'vitest';
import { GROUND_Y, START, areas, autoTriggered, fadeSeconds, isAvailable, nearest, triggerKey, type Transition } from '../src/explore/interaction';
import { createGameState, setFlag, submitPuzzle, puzzles } from '../src/core';

const transitions = (id: string) => areas[id].interactables.filter((i): i is Transition => i.type === 'transition');

describe('맵 데이터', () => {
  it('바닥선 y=158 고정', () => expect(GROUND_Y).toBe(158));
  it('모든 대상이 구역 안, 맵 폭이 카메라(480)보다 넓다', () => {
    for (const [id, a] of Object.entries(areas)) {
      expect(a.maxX - a.minX, id).toBeGreaterThan(480);
      for (const it of a.interactables) { expect(it.x).toBeGreaterThanOrEqual(a.minX); expect(it.x).toBeLessThanOrEqual(a.maxX); }
    }
  });
  it('전환은 서로 돌아오는 링크가 있고 spawn 이 도착 구역 범위 안 (사무실→1층은 일방통행)', () => {
    for (const id of Object.keys(areas)) for (const t of transitions(id)) {
      const to = areas[t.to];
      expect(to, `${id}->${t.to}`).toBeDefined();
      expect(t.spawnX).toBeGreaterThanOrEqual(to.minX); expect(t.spawnX).toBeLessThanOrEqual(to.maxX);
      if (id !== 'office') expect(transitions(t.to).some((b) => b.to === id), `${t.to} 에서 ${id} 로 돌아오는 길`).toBe(true);
    }
  });
  it('계단은 인접 층만 연결 (지하-1층-2층-3층)', () => {
    const floors = ['b1', 'floor1', 'floor2', 'floor3'];
    for (const f of floors) for (const t of transitions(f).filter((x) => x.kind === 'stairs'))
      expect(Math.abs(floors.indexOf(f) - floors.indexOf(t.to)), `${f}->${t.to}`).toBe(1);
  });
  it('사무실 → 1층 → 2층 → 3층 → 2층 → 1층 → 지하 경로가 존재', () => {
    const route = ['office', 'floor1', 'floor2', 'floor3', 'floor2', 'floor1', 'b1'];
    for (let i = 0; i + 1 < route.length; i++) expect(transitions(route[i]).some((t) => t.to === route[i + 1]), `${route[i]}->${route[i + 1]}`).toBe(true);
  });
});

describe('상호작용 규칙', () => {
  it('가장 가까운 대상 1개, 범위 밖이면 없음', () => {
    const s = createGameState(), a = areas.floor2;
    expect(nearest(a, 0, s)?.id).toBe('stairs_down');
    expect(nearest(a, 6 * 45 + 20, s)?.id).toBe('door_201');
    expect(nearest(a, 9 * 45, s)).toBeNull();
  });
  it('지하 계단은 P03·P04 해결 전에는 잠겨 있다', () => {
    const s = createGameState(), a = areas.floor1, stairs = a.interactables.find((i) => i.id === 'stairs_b1')!;
    expect(isAvailable(stairs, s)).toBe(false);
    expect(nearest(a, stairs.x, s)).toBeNull();
    for (const id of ['P03_revision_diff', 'P04_approval_chain']) submitPuzzle(s, id, puzzles.find((p) => p.id === id)!.correctSlots);
    expect(nearest(a, stairs.x, s)?.id).toBe('stairs_b1');
  });
  it('사무실 문은 intro_done 플래그 후에 열린다', () => {
    const s = createGameState(), door = areas.office.interactables.find((i) => i.id === 'door_out')!;
    expect(isAvailable(door, s)).toBe(false);
    setFlag(s, 'intro_done');
    expect(isAvailable(door, s)).toBe(true);
  });
  it('자동 트리거는 범위 안에서 한 번만', () => {
    const s = createGameState(), a = areas.floor1;
    expect(autoTriggered('floor1', a, 0, s)).toBeNull();
    expect(autoTriggered('floor1', a, 2.5 * 45, s)?.id).toBe('baek');
    setFlag(s, triggerKey('floor1', 'baek'));
    expect(autoTriggered('floor1', a, 2.5 * 45, s)).toBeNull();
  });
  it('이미 방문한 구역 전환 페이드는 합계 0.4초 이하', () => {
    const f = fadeSeconds(true);
    expect(f.out + f.in).toBeLessThanOrEqual(0.4);
  });
  it('시작 위치는 사무실', () => expect(START.area).toBe('office'));
});
