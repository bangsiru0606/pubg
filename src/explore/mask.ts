// 근접 조사 소품의 클릭 판정: 투명 여백이 아닌 실제 그림 위인지 (정규화 때 만든 마스크 사용, DOM·캔버스 없음)
import masks from '../data/illust-masks.json';

export type Mask = { W: number; H: number; x: number; y: number; w: number; h: number; bits: string[] };
export const maskOf = (icon: string) => (masks as Record<string, Mask>)[icon];

/** (fx, fy): 실제 그림 영역(bbox) 안의 상대 위치 0~1 */
export function hitsArt(icon: string, fx: number, fy: number): boolean {
  const m = maskOf(icon);
  if (!m || fx < 0 || fy < 0 || fx >= 1 || fy >= 1) return false;
  const row = m.bits[Math.floor(fy * m.bits.length)];
  return row?.[Math.floor(fx * row.length)] === '1';
}
