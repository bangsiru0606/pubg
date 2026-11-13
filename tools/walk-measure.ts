// 대기 그림과 걷기 그림의 몸 높이·머리 크기를 잰다 (public/assets/<id>_*.png, 정규화 결과).
//   몸 높이 = 불투명 픽셀의 위~아래 줄 수, 머리 크기 = 맨 위 22% 줄 안에서의 가로 폭(머리 너비 근사).
//   npx tsx tools/walk-measure.ts            표만 찍는다
//   WALK_LIMIT=2 npx tsx tools/walk-measure.ts   걷기 프레임이 대기 그림과 2px 넘게 다르면 실패
import { existsSync } from 'node:fs';
import sharp from 'sharp';

const IDS = ['player', 'eunho', 'baek', 'haneul', 'oh', 'lee', 'choi', 'han', 'chae'];
const WALK = ['idle_side', 'walk_0', 'walk_1', 'walk_pass', 'walk_2', 'walk_3', 'walk_4', 'walk_5'];
export interface Size { h: number; head: number; top: number }
export async function measure(file: string): Promise<Size | null> {
  if (!existsSync(file)) return null;
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let top = -1, bottom = -1;
  const rowSpan = (y: number) => { let a = -1, b = -1; for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 0) { if (a < 0) a = x; b = x; } return a < 0 ? 0 : b - a + 1; };
  for (let y = 0; y < info.height; y++) if (rowSpan(y)) { if (top < 0) top = y; bottom = y; }
  if (top < 0) return null;
  const h = bottom - top + 1; let head = 0;
  for (let y = top; y < top + Math.round(h * 0.22); y++) head = Math.max(head, rowSpan(y));
  return { h, head, top };
}
export async function table(): Promise<{ id: string; frame: string; h: number; head: number; dh: number; dhead: number }[]> {
  const rows = [];
  for (const id of IDS) {
    const idle = await measure(`public/assets/${id}_idle_0.png`); if (!idle) continue;
    for (const f of WALK) { const m = await measure(`public/assets/${id}_${f}.png`); if (m) rows.push({ id, frame: f, h: m.h, head: m.head, dh: m.h - idle.h, dhead: m.head - idle.head }); }
    rows.push({ id, frame: 'idle_0', h: idle.h, head: idle.head, dh: 0, dhead: 0 });
  }
  return rows;
}
if (process.argv[1]?.endsWith('walk-measure.ts')) {
  const rows = await table();
  console.log('| 인물 | 프레임 | 몸 높이 | 대기 대비 | 머리 폭 | 대기 대비 |\n|---|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.id} | ${r.frame} | ${r.h} | ${r.dh >= 0 ? '+' : ''}${r.dh} | ${r.head} | ${r.dhead >= 0 ? '+' : ''}${r.dhead} |`);
  const lim = process.env.WALK_LIMIT ? +process.env.WALK_LIMIT : 0;
  if (lim) { const bad = rows.filter((r) => r.frame !== 'walk_pass' && (Math.abs(r.dh) > lim)); if (bad.length) { console.error(`FAIL 몸 높이가 대기 그림과 ${lim}px 넘게 다른 걷기 프레임: ${bad.map((b) => `${b.id}/${b.frame}(${b.dh})`).join(', ')}`); process.exit(1); } }
}
