import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { applyOutline, measureOutlineColor, padForOutline } from '../tools/outline';

const make = async (w: number, h: number, fn: (x: number, y: number) => number[]) => {
  const b = Buffer.alloc(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b.set(fn(x, y), (y * w + x) * 4);
  return sharp(b, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
};
const raw = async (png: Buffer) => { const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };
const at = (d: { data: Buffer; w: number }, x: number, y: number) => [...d.data.subarray((y * d.w + x) * 4, (y * d.w + x) * 4 + 4)];
const COLOR: [number, number, number] = [20, 10, 10];

describe('바깥쪽 1px 외곽선', () => {
  // 12x12, 가운데 안쪽 6x6(2..7)이 불투명: 가장자리 1줄은 어두운 색, 안은 밝은 색. 한 픽셀짜리 파란 디테일이 가장자리에 있다.
  const body = (x: number, y: number) => {
    if (x < 3 || x > 8 || y < 3 || y > 8) return [0, 0, 0, 0];
    if (x === 3 && y === 5) return [40, 80, 200, 255]; // 실루엣 끝의 작은 디테일 (파란 머리끈)
    return x === 3 || x === 8 || y === 3 || y === 8 ? [20, 10, 10, 255] : [200, 190, 180, 255];
  };
  it('기준 색은 가장자리의 최빈 어두운 색', async () => expect(await measureOutlineColor(await make(12, 12, body))).toEqual([20, 10, 10]));
  it('불투명 픽셀의 색·알파는 보정 전후 동일하다 (디테일이 덮이지 않는다)', async () => {
    const src = await make(12, 12, body), a = await raw(src), b = await raw(await applyOutline(src, COLOR));
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (a.data[(y * 12 + x) * 4 + 3] !== 0) expect(at(b, x, y), `(${x},${y})`).toEqual(at(a, x, y));
    expect(at(b, 3, 5)).toEqual([40, 80, 200, 255]);
  });
  it('새로 칠한 픽셀은 모두 원래 투명이었고 불투명 픽셀과 상하좌우로 맞닿아 있다', async () => {
    const src = await make(12, 12, body), a = await raw(src), b = await raw(await applyOutline(src, COLOR));
    let painted = 0;
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
      const i = (y * 12 + x) * 4;
      if (a.data[i + 3] === 0 && b.data[i + 3] !== 0) {
        painted++;
        expect(at(b, x, y)).toEqual([...COLOR, 255]);
        const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (a.data[((y + dy) * 12 + x + dx) * 4 + 3] ?? 0) !== 0);
        expect(n, `(${x},${y}) 이웃`).toBe(true);
      }
    }
    expect(painted).toBeGreaterThan(0);
    expect(at(b, 2, 5)).toEqual([...COLOR, 255]); // 디테일 바깥쪽에 외곽선이 생긴다
  });
  it('발 아래 접지면은 칠하지 않는다', async () => {
    const feet = await make(8, 8, (x, y) => (x >= 2 && x < 6 && y >= 2 && y < 6 ? [200, 190, 180, 255] : [0, 0, 0, 0]));
    const b = await raw(await applyOutline(feet, COLOR));
    expect(at(b, 3, 6)[3]).toBe(0); expect(at(b, 3, 7)[3]).toBe(0); // 발 아래
    expect(at(b, 1, 3)).toEqual([...COLOR, 255]); expect(at(b, 3, 1)).toEqual([...COLOR, 255]); // 옆·위는 칠한다
  });
  it('여백 확보: 위·좌·우 1px 을 붙여도 하단은 그대로고 가장자리에 닿은 외곽선이 잘리지 않는다', async () => {
    const edge = await make(6, 6, (_x, y) => (y >= 0 ? [200, 190, 180, 255] : [0, 0, 0, 0])); // 캔버스를 꽉 채운 그림
    const padded = await padForOutline(edge), p = await raw(padded);
    expect([p.w, p.h]).toEqual([8, 7]);
    const o = await raw(await applyOutline(padded, COLOR));
    expect(at(o, 0, 3)).toEqual([...COLOR, 255]); expect(at(o, 4, 0)).toEqual([...COLOR, 255]); expect(at(o, 7, 3)).toEqual([...COLOR, 255]);
  });
});
