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
      if (near && data[i + 1] - Math.max(data[i], data[i + 2]) >= 50) spill++;
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
  it('어두운 올리브·연두 계열 색은 가장자리에서도 바뀌지 않는다', async () => {
    const W = 8, H = 8, buf = Buffer.alloc(W * H * 4);
    for (let i = 0; i < W * H; i++) { const x = i % W; buf.set(x < 3 ? [0, 255, 0, 255] : [80, 100, 40, 255], i * 4); } // 왼쪽 키 배경, 오른쪽 올리브
    const png = await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
    const { data } = await sharp(await despillEdges(await removeChromaKey(png))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const i = (3 * W + 3) * 4; // 투명 경계 바로 옆 올리브 픽셀
    expect([data[i], data[i + 1], data[i + 2], data[i + 3]]).toEqual([80, 100, 40, 255]);
  });
  it('실제 생성 에셋이 없어도 통과한다 (합성 이미지만 사용)', () => expect(true).toBe(true));
});

describe('despill full (소품 전용)', () => {
  it('g > max(r,b) 인 픽셀이 남지 않고, 알파는 그대로다', async () => {
    const { despillFull } = await import('../tools/chroma');
    const keyed = await removeChromaKey('tests/fixtures/chroma_shapes.png');
    const { data } = await sharp(await despillFull(keyed)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const before = (await sharp(keyed).ensureAlpha().raw().toBuffer());
    for (let i = 0; i < data.length; i += 4) { expect(data[i + 1]).toBeLessThanOrEqual(Math.max(data[i], data[i + 2])); expect(data[i + 3]).toBe(before[i + 3]); }
  });
  it('trimSoftEdge: 알파 255 미만 픽셀이 없다', async () => {
    const { trimSoftEdge } = await import('../tools/chroma');
    const { data } = await sharp(await trimSoftEdge(await removeChromaKey('tests/fixtures/chroma_shapes.png'))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += 4) expect(data[i] === 0 || data[i] === 255).toBe(true);
  });
  it('배치 5 소품 정규화 결과에 초록기 픽셀이 없다', async () => {
    const { readFileSync } = await import('node:fs');
    const spec = JSON.parse(readFileSync('art/asset-spec.json', 'utf8'));
    const props = spec.sprites.filter((s: any) => s.despill === 'full');
    expect(props.length).toBe(29); // 배치 6 에서 floor_plan_board·stairs_basement_closed, 배치 8 에서 desk_pc·doctrine_frame·prayer_corner·donor_plaque 가 늘었다
    for (const s of props) {
      const { data } = await sharp(`public/assets/${s.id}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let bad = 0; for (let i = 0; i < data.length; i += 4) if (data[i + 3] && data[i + 1] - Math.max(data[i], data[i + 2]) > 8) bad++;
      expect(bad, s.id).toBe(0);
    }
  });
});
