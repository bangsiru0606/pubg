import { describe, expect, it } from 'vitest';
import { GROUND_Y, START, areas, autoTriggered, fadeSeconds, isAvailable, nearest, talkStand, flipFor, facesLeft, triggerKey, type Transition } from '../src/explore/interaction';
import { createGameState, setFlag, puzzles } from '../src/core';
import { submitPuzzle } from './helpers';

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
    expect((stairs as Transition).lockedDialogue).toBe('mono_basement_locked'); // 잠겨 있어도 반응한다: 잠김 독백
    expect(nearest(a, stairs.x, s)?.id).toBe('stairs_b1');
    for (const id of ['P03_revision_diff', 'P04_approval_chain']) submitPuzzle(s, id, puzzles.find((p) => p.id === id)!.correctSlots);
    expect(nearest(a, stairs.x, s)?.id).toBe('stairs_b1');
  });
  it('사무실 문은 intro_done 플래그 후에 열린다', () => {
    const s = createGameState(), door = areas.office.interactables.find((i) => i.id === 'door_out')!;
    expect(isAvailable(door, s)).toBe(false);
    setFlag(s, 'intro_done');
    expect(isAvailable(door, s)).toBe(true);
  });
  it('1층 백선우 대화는 걸어서 거는 자동 트리거가 아니라 구역 연출(stage)로 시작한다', () => {
    const a = areas.floor1, s = createGameState();
    expect(autoTriggered('floor1', a, 112.5, s)).toBeNull();
    expect(a.stage?.flag).toBe(triggerKey('floor1', 'baek')); // 한 번 본 뒤에는 다시 재생하지 않는다 (이 플래그)
    const steps = a.stage!.steps.map((q) => q.do);
    expect(steps.indexOf('dialogue')).toBeGreaterThan(steps.indexOf('camera')); // 카메라를 백선우에게 옮긴 뒤 대화
    expect(steps.indexOf('hide')).toBeGreaterThan(steps.indexOf('dialogue')); // 대화가 끝나면 퇴장
    expect(steps.at(-1)).toBe('unlock'); // 마지막에 조작을 푼다
    expect(a.stage!.steps.find((q) => q.do === 'dialogue')!.id).toBe('baek_lobby');
  });
  it('이미 방문한 구역 전환 페이드는 합계 0.4초 이하', () => {
    const f = fadeSeconds(true);
    expect(f.out + f.in).toBeLessThanOrEqual(0.4);
  });
  it('시작 위치는 사무실', () => expect(START.area).toBe('office'));
});

describe('대화 위치', () => {
  it('최소 56px 를 두고 플레이어가 있던 쪽에 선다, 겹치면 왼쪽, 맵 끝이면 반대쪽', () => {
    expect(talkStand(100, 180, -90, 630)).toEqual({ x: 124, playerFacesLeft: false });
    expect(talkStand(300, 180, -90, 630)).toEqual({ x: 236, playerFacesLeft: true });
    expect(talkStand(180, 180, -90, 630).x).toBe(124);
    expect(talkStand(-80, -85, -90, 630).x).toBe(-29);
  });
});

describe('바라보는 방향', () => {
  it('원본이 왼쪽을 보는 한지수: 오른쪽을 보려면 flip, 왼쪽을 보려면 flip 없음', () => {
    expect(flipFor('player', false)).toBe(true);
    expect(flipFor('player', true)).toBe(false);
    expect(facesLeft('player', flipFor('player', false))).toBe(false);
    expect(facesLeft('player', flipFor('player', true))).toBe(true);
  });
  it('원본이 왼쪽을 보는 박은호(idle·walk 프레임 모두): 왼쪽을 보려면 그대로, 오른쪽을 보려면 flip', () => {
    expect(flipFor('eunho', true)).toBe(false);
    expect(flipFor('eunho', false)).toBe(true);
    expect(facesLeft('eunho', flipFor('eunho', true))).toBe(true);
  });
  it('facing 이 없는 스프라이트는 오류', () => expect(() => flipFor('nobody', true)).toThrow());
  it('대화 위치: 두 캐릭터가 서로를 바라본다 (플레이어 왼쪽 → 플레이어는 오른쪽, 상대는 왼쪽)', () => {
    const st = talkStand(100, 180, -90, 630);
    expect(facesLeft('player', flipFor('player', st.playerFacesLeft))).toBe(false);
    expect(facesLeft('eunho', flipFor('eunho', !st.playerFacesLeft))).toBe(true);
  });
});
