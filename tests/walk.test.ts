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
