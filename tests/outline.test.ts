import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { applyOutline, measureOutlineColor } from '../tools/outline';

const make = async (w: number, h: number, fn: (x: number, y: number) => number[]) => {
  const b = Buffer.alloc(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b.set(fn(x, y), (y * w + x) * 4);
  return sharp(b, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
};
const px = async (png: Buffer, w: number, x: number, y: number) => { const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); const i = (y * w + x) * 4; return [...data.subarray(i, i + 4)]; };

describe('외곽선 보정', () => {
  // 10x10: 가운데 6x6 불투명(밝은 몸통), 가장자리 1줄은 어두운 색 (20,10,10)
  const body = (x: number, y: number) => (x >= 2 && x < 8 && y >= 2 && y < 8 ? ((x === 2 || x === 7 || y === 2 || y === 7) ? [20, 10, 10, 255] : [200, 190, 180, 255]) : [0, 0, 0, 0]);
  it('기준 색은 가장자리의 최빈 어두운 색', async () => expect(await measureOutlineColor(await make(10, 10, body))).toEqual([20, 10, 10]));
  it('투명과 맞닿은 불투명 가장자리 1줄만 칠하고, 실루엣(알파)은 그대로', async () => {
    const light = await make(10, 10, (x, y) => (x >= 2 && x < 8 && y >= 2 && y < 8 ? [200, 190, 180, 255] : [0, 0, 0, 0]));
    const out = await applyOutline(light, [20, 10, 10]);
    expect(await px(out, 10, 2, 2)).toEqual([20, 10, 10, 255]);   // 모서리
    expect(await px(out, 10, 5, 2)).toEqual([20, 10, 10, 255]);   // 윗변
    expect(await px(out, 10, 3, 3)).toEqual([200, 190, 180, 255]); // 안쪽은 그대로
    expect(await px(out, 10, 1, 1)).toEqual([0, 0, 0, 0]);         // 바깥은 그대로 투명
    const a = await sharp(light).ensureAlpha().raw().toBuffer(), b = await sharp(out).ensureAlpha().raw().toBuffer();
    for (let i = 3; i < a.length; i += 4) expect(b[i]).toBe(a[i]);
  });
  it('캔버스 아래 가장자리(발 접지면)는 외곽선으로 칠하지 않는다', async () => {
    const feet = await make(6, 6, (x, y) => (x >= 1 && x < 5 && y >= 2 ? [200, 190, 180, 255] : [0, 0, 0, 0]));
    const out = await applyOutline(feet, [20, 10, 10]);
    expect(await px(out, 6, 2, 5)).toEqual([200, 190, 180, 255]);
  });
});
