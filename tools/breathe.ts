// 숨쉬기 프레임: 정규화한 idle_0 에서 허리 위쪽만 1px 아래로 내리고 발(허리 아래)은 그대로 둔다.
import sharp from 'sharp';

/** waistFrac: 위에서부터 허리까지의 비율 (캔버스 높이 기준) */
export async function breatheFrame(png: Buffer, waistFrac = 0.55): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info, waist = Math.round(h * waistFrac);
  const out = Buffer.from(data);
  for (let y = waist; y >= 1; y--) data.copy(out, y * w * 4, (y - 1) * w * 4, y * w * 4); // 위쪽 [0, waist) 을 한 줄씩 아래로
  out.fill(0, 0, w * 4);                                                                     // 맨 윗줄은 투명
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}
export const waistRow = (h: number, waistFrac = 0.55) => Math.round(h * waistFrac);
