import { describe, expect, it } from 'vitest';
import spec from '../art/asset-spec.json';
import { facesLeft, flipFor, walkFlip } from '../src/explore/interaction';

const ids = (spec.sequences as { id: string }[]).map((q) => q.id);
describe('걷는 방향과 몸 방향', () => {
  it('플레이어·박은호·모든 NPC: 왼쪽/오른쪽으로 걸을 때 이동 방향을 본다', () => {
    expect(ids).toContain('eunho'); expect(ids).toContain('player');
    for (const id of ids) {
      expect(facesLeft(id, walkFlip(id, 100, 40)), `${id} 왼쪽으로 걷기`).toBe(true);
      expect(facesLeft(id, walkFlip(id, 40, 100)), `${id} 오른쪽으로 걷기`).toBe(false);
    }
  });
  it('원본 그림이 왼쪽을 보는 인물(한지수·박은호)은 오른쪽으로 걸을 때 뒤집는다', () => {
    const f = Object.fromEntries((spec.sequences as { id: string; facing: string }[]).map((q) => [q.id, q.facing]));
    expect(f.player).toBe('left'); expect(f.eunho).toBe('left'); // 박은호: idle·walk 프레임이 모두 왼쪽을 본다 (right 로 적혀 있던 것이 오프닝에서 뒤로 걷는 원인이었다)
    expect(walkFlip('eunho', 0, 10)).toBe(true); expect(walkFlip('eunho', 10, 0)).toBe(false);
    expect(flipFor('eunho', true)).toBe(false);
  });
});

describe('걷기·대기 그림 크기 (4차 피드백 7: 걷기 쪼그라듦)', () => {
  it('머리가 내려가는 프레임(walk_1·walk_3)을 뺀 걷기 프레임의 몸 높이는 대기 그림과 2px 이내', async () => {
    const { measure } = await import('../tools/walk-measure');
    for (const id of ['player', 'eunho', 'baek', 'haneul']) {
      const idle = (await measure(`public/assets/${id}_idle_0.png`))!;
      for (const f of ['walk_0', 'walk_pass', 'walk_2']) { const m = (await measure(`public/assets/${id}_${f}.png`))!; expect(Math.abs(m.h - idle.h), `${id}/${f} 몸 높이 ${m.h} vs 대기 ${idle.h}`).toBeLessThanOrEqual(2); }
    }
  });
});

describe('서 있는 그림 = walk_pass (4차 후속)', () => {
  it('걷는 인물의 idle_0(정하늘은 idle_side)은 walk_pass 와 같은 크기·몸 폭이다', async () => {
    const { measure } = await import('../tools/walk-measure');
    for (const [id, stand] of [['player', 'idle_0'], ['eunho', 'idle_0'], ['baek', 'idle_0'], ['haneul', 'idle_side']] as const) {
      const a = (await measure(`public/assets/${id}_${stand}.png`))!, b = (await measure(`public/assets/${id}_walk_pass.png`))!;
      expect(a, id).toEqual(b);
    }
  });
});
