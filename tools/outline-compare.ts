// 외곽선 보정 전후 비교 이미지: 한지수·박은호·생성 인물 7명을 한 줄로 (×4, 최근접)
import sharp from 'sharp';
const ids = ['player', 'eunho', 'baek', 'oh', 'lee', 'choi', 'han', 'chae', 'haneul'];
async function sheet(dir: string, out: string) {
  const bufs = await Promise.all(ids.map((id) => sharp(`${dir}/${id}_idle_0.png`).resize({ height: 360, kernel: 'nearest' }).toBuffer()));
  const ms = await Promise.all(bufs.map((b) => sharp(b).metadata()));
  let x = 12; const comp = bufs.map((b, i) => { const c = { input: b, left: x, top: 10 }; x += ms[i].width! + 24; return c; });
  await sharp({ create: { width: x, height: 380, channels: 4, background: { r: 98, g: 112, b: 108, alpha: 1 } } }).composite(comp).png().toFile(out);
}
await sheet('.tmp/before', 'docs/screenshots/stage8_outline_before.png');
await sheet('public/assets', 'docs/screenshots/stage8_outline_after.png');
