// 외곽선 보정: 투명 영역과 맞닿은 불투명 가장자리 픽셀 1줄을 기준 외곽선 색으로 칠한다 (실루엣 크기는 바뀌지 않는다).
// 기준 색은 정규화된 한지수 스프라이트(player_idle_0)의 가장자리 픽셀 중 가장 많이 쓰인 어두운 색.
import sharp from 'sharp';

const DARK = 90; // 어두운 색 판정(밝기)
type RGB = [number, number, number];
const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

async function raw(png: Buffer) { const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; }
const isEdge = (d: Buffer, w: number, h: number, x: number, y: number) => {
  // 이미지 안쪽의 투명 이웃만 센다 (캔버스 가장자리는 바닥 접지면이므로 외곽선으로 보지 않는다)
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    if (d[(ny * w + nx) * 4 + 3] === 0) return true;
  }
  return false;
};

/** 가장자리 픽셀 중 가장 많은 어두운 색 */
export async function measureOutlineColor(png: Buffer): Promise<RGB> {
  const { data, w, h } = await raw(png);
  const count = new Map<string, number>();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (data[i + 3] === 0 || !isEdge(data, w, h, x, y) || luma(data[i], data[i + 1], data[i + 2]) > DARK) continue;
    const k = `${data[i]},${data[i + 1]},${data[i + 2]}`; count.set(k, (count.get(k) ?? 0) + 1);
  }
  const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best) throw new Error('기준 스프라이트에서 어두운 외곽선 색을 찾지 못했다');
  return best[0].split(',').map(Number) as RGB;
}

/**
 * 바깥쪽 1px 외곽선: 불투명 픽셀은 하나도 바꾸지 않고, 불투명 픽셀과 상하좌우로 맞닿은 투명 픽셀에 기준색을 칠한다.
 * 가장 아래 불투명 행의 바로 아래(발 접지면)는 칠하지 않는다. 캔버스 밖으로는 칠할 수 없으므로 호출 전에 pad 로 여백 1px 을 확보한다.
 */
export async function applyOutline(png: Buffer, color: RGB): Promise<Buffer> {
  const { data, w, h } = await raw(png);
  let bottom = -1;
  for (let y = h - 1; y >= 0 && bottom < 0; y--) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] !== 0) { bottom = y; break; }
  const out = Buffer.from(data);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (data[i + 3] !== 0 || y > bottom) continue; // 이미 불투명이거나 발 아래
    const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < w && ny < h && data[(ny * w + nx) * 4 + 3] !== 0;
    });
    if (touches) { out[i] = color[0]; out[i + 1] = color[1]; out[i + 2] = color[2]; out[i + 3] = 255; }
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

/** 위·좌·우에 투명 여백 1px 을 붙인다 (높이는 그만큼 늘어나므로 호출 쪽에서 미리 1px 작게 만든다). 하단·피벗은 그대로. */
export const padForOutline = (png: Buffer) => sharp(png).extend({ top: 1, left: 1, right: 1, bottom: 0, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
