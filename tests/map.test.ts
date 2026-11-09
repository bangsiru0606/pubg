import { describe, expect, it } from 'vitest';
import map from '../src/data/map.json';

describe('office map', () => {
  const o = map.office;
  it('플레이어 시작·NPC·문이 이동 범위 안', () => {
    for (const x of [o.playerStartX, ...o.npcs.map((n) => n.x), ...o.objects.map((b) => b.x)]) {
      expect(x).toBeGreaterThanOrEqual(o.minX);
      expect(x).toBeLessThanOrEqual(o.maxX);
    }
  });
  it('맵 폭이 카메라(480)보다 넓다', () => expect(o.maxX - o.minX).toBeGreaterThan(480));
});
