import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import spec from '../art/asset-spec.json';

async function colours(file: string) {
  const { data } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const set = new Set<number>();
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 0) set.add(0); else set.add(((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0); // 투명 픽셀 RGB 는 0 으로 정규화
  return set;
}

describe('캐릭터 프레임 팔레트 통일', () => {
  for (const q of spec.sequences) {
    it(`${q.id}: 모든 프레임 색 합집합 ≤ ${q.colours}`, async () => {
      const union = new Set<number>();
      for (const f of (q as { breathe?: boolean }).breathe ? ['idle_0', 'idle_1'] : q.frames) for (const c of await colours(`public/assets/${q.id}_${f}.png`)) union.add(c);
      expect(union.size).toBeLessThanOrEqual(q.colours);
    });
  }
});
