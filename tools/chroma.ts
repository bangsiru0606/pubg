// #00FF00 크로마키 제거: 키 색과 가까운 픽셀은 투명, 가장자리(반투명 구간)는 알파를 부드럽게 줄이고 초록 번짐(spill)을 걷어 낸다.
// 청록·회청색·회색 같은 비슷한 색은 지우지 않도록 RGB 거리로만 판정한다 (순수 초록 계열만 제거).
import sharp from 'sharp';

export interface ChromaOptions { key?: [number, number, number]; solid?: number; soft?: number }
const KEY: [number, number, number] = [0, 255, 0];

/** 키 색과의 거리 d: d <= solid → 완전 투명, solid < d < soft → 알파 비례, d >= soft → 불투명 */
export function keyAlpha(r: number, g: number, b: number, key = KEY, solid = 70, soft = 130): number {
  const d = Math.hypot(r - key[0], g - key[1], b - key[2]);
  return d <= solid ? 0 : d >= soft ? 1 : (d - solid) / (soft - solid);
}

export async function removeChromaKey(input: Buffer | string, o: ChromaOptions = {}): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const key = o.key ?? KEY;
  for (let i = 0; i < data.length; i += 4) {
    const a = keyAlpha(data[i], data[i + 1], data[i + 2], key, o.solid, o.soft);
    if (a === 0) { data[i + 3] = 0; continue; }
    if (a < 1) { // 가장자리: 초록 번짐 제거 후 알파 정리
      const cap = Math.max(data[i], data[i + 2]);
      if (data[i + 1] > cap) data[i + 1] = cap;
      data[i + 3] = Math.round(data[i + 3] * a);
    }
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

/**
 * 가장자리 초록 번짐 제거: 투명 픽셀에서 `radius` 칸 안에 있는 픽셀의 g 를 max(r, b) 로 제한한다.
 * 청록(g == b)·회색(r == g == b) 은 g 가 max(r, b) 이하이므로 그대로 남는다.
 */
export async function despillEdges(png: Buffer, radius = 2): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const clear = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || data[(y * w + x) * 4 + 3] === 0;
  const out = Buffer.from(data);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (data[i + 3] === 0) continue;
    let near = false;
    for (let dy = -radius; dy <= radius && !near; dy++) for (let dx = -radius; dx <= radius; dx++) if (clear(x + dx, y + dy)) { near = true; break; }
    if (!near) continue;
    const cap = Math.max(data[i], data[i + 2]);
    if (data[i + 1] > cap) out[i + 1] = cap;
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}
