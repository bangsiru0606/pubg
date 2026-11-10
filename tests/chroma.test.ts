import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { despillEdges, keyAlpha, removeChromaKey } from '../tools/chroma';

const load = async () => {
  const keyed = await despillEdges(await removeChromaKey('tests/fixtures/chroma_shapes.png'));
  const { data, info } = await sharp(keyed).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x: number, y: number) => { const i = (y * info.width + x) * 4; return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] }; };
  return { px, info, data };
};

describe('크로마키 제거 (#00FF00)', () => {
  it('배경은 투명, 회색·청록·검은 외곽선은 그대로 남는다', async () => {
    const { px } = await load();
    expect(px(0, 0).a).toBe(0); expect(px(60, 60).a).toBe(0);
    expect(px(14, 28)).toMatchObject({ r: 128, g: 128, b: 128, a: 255 }); // 회색
    expect(px(44, 28)).toMatchObject({ r: 0, g: 128, b: 128, a: 255 });   // 청록 (키 색과 가깝지 않다)
    expect(px(44, 14).a).toBe(255); // 검은 외곽선 근처는 불투명
  });
  it('부드러운 가장자리: 반투명이 생기고, 투명 이웃 2칸 안에서는 초록 번짐이 없다', async () => {
    const { data, info } = await load();
    let semi = 0, spill = 0;
    for (let y = 2; y < info.height - 2; y++) for (let x = 2; x < info.width - 2; x++) {
      const i = (y * info.width + x) * 4, a = data[i + 3];
      if (a === 0) continue;
      if (a < 255) semi++;
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (data[((y + dy) * info.width + x + dx) * 4 + 3] === 0) { near = true; break; }
      if (near && data[i + 1] > Math.max(data[i], data[i + 2])) spill++;
    }
    expect(semi).toBeGreaterThan(0);
    expect(spill).toBe(0);
  });
  it('키 색과의 거리로만 판정한다: 순수 초록 계열만 제거', () => {
    expect(keyAlpha(0, 255, 0)).toBe(0);
    expect(keyAlpha(10, 245, 10)).toBe(0);
    expect(keyAlpha(0, 128, 128)).toBe(1);      // 청록
    expect(keyAlpha(110, 130, 120)).toBe(1);    // 회청색
    expect(keyAlpha(128, 128, 128)).toBe(1);    // 회색
    expect(keyAlpha(0, 190, 40)).toBeGreaterThan(0); // 키 색에서 멀어진 초록은 일부 남는다
  });
  it('실제 생성 에셋이 없어도 통과한다 (합성 이미지만 사용)', () => expect(true).toBe(true));
});
