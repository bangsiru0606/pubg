// 걷기 한 주기 GIF: asset-spec 의 걷기 순서(공통 walk.cycle, 인물별 walkCycle)와 fps 로 → docs/screenshots/walk_<인물>.gif
//   npx tsx tools/walk-gifs.ts      (정규화된 public/assets/<id>_<프레임>.png 를 쓴다. 한 장이 한 프레임, 프레임 시간 = 1/fps)
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { findFfmpeg } from './audio-assets';

const spec = JSON.parse(readFileSync('art/asset-spec.json', 'utf8')) as { walk: { fps: number; cycle: string[] }; sequences: { id: string; walkCycle?: string[]; walkFps?: number }[] };
const ff = findFfmpeg();
if (!ff) throw new Error('ffmpeg 가 없다');
const RUN = (JSON.parse(readFileSync('src/data/map.json', 'utf8')) as { runMultiplier: number }).runMultiplier;
for (const [id, mode] of [['player', 'walk'], ['player', 'run'], ['eunho', 'walk'], ['baek', 'walk']] as const) { // 달리기는 이동 속도와 같은 배수로 fps 를 올린다
  const q = spec.sequences.find((x) => x.id === id)!, cycle = q.walkCycle ?? spec.walk.cycle, fps = (q.walkFps ?? spec.walk.fps) * (mode === 'run' ? RUN : 1);
  const dir = `.tmp/gif_${mode}_${id}`; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const S = 4, W = 70 * S, H = 94 * S;
  for (const [i, f] of cycle.entries()) {
    const img = await sharp(`public/assets/${id}_${f}.png`).resize({ height: 90 * S, kernel: 'nearest' }).png().toBuffer(), m = await sharp(img).metadata();
    await sharp({ create: { width: W, height: H, channels: 3, background: '#3a4a50' } }).composite([{ input: img, left: Math.round((W - m.width!) / 2), top: H - m.height! - 2 * S }]).png().toFile(`${dir}/${i}.png`);
  }
  const out = `docs/screenshots/${mode}_${id}.gif`;
  const r = spawnSync(ff, ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', `${dir}/%d.png`, '-vf', 'split[a][b];[a]palettegen[p];[b][p]paletteuse', '-loop', '0', out]);
  if (r.status !== 0) throw new Error(String(r.stderr));
  console.log(`${out}: ${cycle.join(' → ')} @ ${fps}fps (한 주기 ${(cycle.length / fps).toFixed(2)}초)`);
}

// 대기 → 걷기 → 대기 전환 (몸 크기·발 높이가 바뀌지 않는지 확인): 바닥선(분홍 줄)과 머리 높이 줄(청록)을 함께 그린다 → docs/screenshots/walk_transition_baek.gif
{
  const id = 'baek', q = spec.sequences.find((x) => x.id === id)!, cycle = q.walkCycle ?? spec.walk.cycle, fps = spec.walk.fps;
  const seq = ['idle_0', 'idle_0', 'idle_0', ...cycle, ...cycle, 'idle_0', 'idle_0', 'idle_0'];
  const dir = '.tmp/gif_transition_baek'; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const S = 4, W = 70 * S, H = 94 * S, groundY = H - 2 * S;
  for (const [i, f] of seq.entries()) {
    const img = await sharp(`public/assets/${id}_${f}.png`).resize({ height: 90 * S, kernel: 'nearest' }).png().toBuffer(), m = await sharp(img).metadata();
    const lines = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="0" y="${groundY}" width="${W}" height="1" fill="#ff5fa0"/><rect x="0" y="${groundY - 86 * S}" width="${W}" height="1" fill="#40e0d0"/></svg>`;
    await sharp({ create: { width: W, height: H, channels: 3, background: '#3a4a50' } }).composite([{ input: img, left: Math.round((W - m.width!) / 2), top: H - m.height! - 2 * S }, { input: Buffer.from(lines), left: 0, top: 0 }]).png().toFile(`${dir}/${i}.png`);
  }
  const out = 'docs/screenshots/walk_transition_baek.gif';
  const r = spawnSync(ff, ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', `${dir}/%d.png`, '-vf', 'split[a][b];[a]palettegen[p];[b][p]paletteuse', '-loop', '0', out]);
  if (r.status !== 0) throw new Error(String(r.stderr));
  console.log(`${out}: idle ×3 → ${cycle.join(' → ')} ×2 → idle ×3 @ ${fps}fps`);
}
