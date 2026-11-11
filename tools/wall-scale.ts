// 벽 배경과 캐릭터(90px)의 비율 확인: 벽마다 [조정 전 | 조정 후]를 한 장으로 → docs/screenshots/wall_scale.png
//   조정값은 src/data/map.json 의 구역 bg.wallOffsetY (벽을 아래로 내리는 px, 기본 0). 원본·정규화 결과는 고치지 않는다.
//   눈금: 바닥에서 35~40px(허리, 초록 띠), 90px(캐릭터 키, 노랑), 103px(조정 전 난간, 빨강 점선)
import { readFileSync } from 'node:fs';
import sharp, { type OverlayOptions } from 'sharp';

const map = JSON.parse(readFileSync('src/data/map.json', 'utf8')).areas as Record<string, { name: string; bg?: { wall: string; wallOffsetY?: number } }>;
const walls = new Map<string, { areas: string[]; off: number }>();
for (const [id, a] of Object.entries(map)) { const w = a.bg?.wall; if (!w) continue; const e = walls.get(w) ?? { areas: [], off: a.bg?.wallOffsetY ?? 0 }; e.areas.push(id); walls.set(w, e); }
const S = 3, W = 200, H = 150, GROUND = 270; // 벽 그림의 아래쪽 H px, 가로 W px 를 ×3 으로
const player = await sharp('public/assets/player_idle_0.png').resize({ height: 90 * S, kernel: 'nearest' }).png().toBuffer();
const pm = await sharp(player).metadata();
const tiles: OverlayOptions[] = []; const labels: string[] = [];
const CW = W * S + 10, CH = H * S + 22;
let i = 0;
for (const [wall, e] of walls) {
  const meta = await sharp(`public/assets/${wall}.png`).metadata();
  for (const [k, off] of [[0, 0], [1, e.off]] as const) {
    // 벽 그림을 off 만큼 내려 그린다: 화면 아래 H px(= 바닥선 위 H px) 를 자른다
    const top = Math.max(0, GROUND - H - off), crop = await sharp(`public/assets/${wall}.png`).extract({ left: 40, top, width: Math.min(W, meta.width! - 40), height: H }).resize({ width: W * S, kernel: 'nearest' }).png().toBuffer();
    const ox = (i % 2) * 0 + k * CW, oy = Math.floor(i) * CH;
    const mark = (hh: number, color: string, dash = false) => `<line x1="0" x2="${W * S}" y1="${H * S - hh * S}" y2="${H * S - hh * S}" stroke="${color}" stroke-width="2" ${dash ? 'stroke-dasharray="8 6"' : ''}/>`;
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W * S}" height="${H * S}">${mark(35, '#5fd35f')}${mark(40, '#5fd35f')}${mark(90, '#e8d36a')}${mark(103, '#e05050', true)}</svg>`);
    tiles.push({ input: crop, left: ox, top: oy + 18 }, { input: player, left: ox + 40, top: oy + 18 + H * S - pm.height! }, { input: svg, left: ox, top: oy + 18 });
    labels.push(`<text x="${ox + 4}" y="${oy + 13}" font-size="13" fill="#e8dcc0" font-family="monospace">${wall} ${k ? `조정 후 (wallOffsetY=${e.off})` : '조정 전'} — ${e.areas.join(', ')}</text>`);
  }
  i++;
}
const SW = CW * 2, SH = CH * walls.size;
await sharp({ create: { width: SW, height: SH, channels: 3, background: '#181818' } }).composite([...tiles, { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}">${labels.join('')}</svg>`), left: 0, top: 0 }]).png().toFile('docs/screenshots/wall_scale.png');
console.log(`벽 ${walls.size}종 → docs/screenshots/wall_scale.png`);
for (const [w, e] of walls) console.log(`${w.padEnd(18)} wallOffsetY=${e.off}  (${e.areas.join(', ')})`);
