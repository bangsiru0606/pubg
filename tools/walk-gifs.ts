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
for (const [id, mode] of [['player', 'walk'], ['player', 'run'], ['eunho', 'walk']] as const) { // 달리기는 이동 속도와 같은 배수로 fps 를 올린다
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
