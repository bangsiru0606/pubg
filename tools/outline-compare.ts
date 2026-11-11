// 외곽선 보정 비교 이미지: 한 줄 비교(전/후)와 디테일 ×8 확대 전후
// npx tsx tools/outline-compare.ts <before 폴더> <출력 접두어>  예) .tmp/before docs/screenshots/stage8_outline
import sharp from 'sharp';
const beforeDir = process.argv[2] ?? '.tmp/before', prefix = process.argv[3] ?? 'docs/screenshots/stage8_outline';
const ids = ['player', 'eunho', 'baek', 'oh', 'lee', 'choi', 'han', 'chae', 'haneul'];
const BG = { r: 98, g: 112, b: 108, alpha: 1 };
async function row(dir: string, out: string) {
  const bufs = await Promise.all(ids.map((id) => sharp(`${dir}/${id}_idle_0.png`).resize({ height: 360, kernel: 'nearest' }).toBuffer()));
  const ms = await Promise.all(bufs.map((b) => sharp(b).metadata()));
  let x = 12; const comp = bufs.map((b, i) => { const c = { input: b, left: x, top: 10 }; x += ms[i].width! + 24; return c; });
  await sharp({ create: { width: x, height: 380, channels: 4, background: BG } }).composite(comp).png().toFile(out);
}
await row('public/assets', `${prefix}_after2.png`);
// 디테일 (스프라이트 90px 기준 영역): 한지수 머리(비교 기준), 한유진 머리끈, 백선우 안경, 최옥자 묵주, 정하늘 찢어진 소매
const crops: [string, string, number, number][] = [['player', '한지수 머리(기준)', 0, 36], ['han', '한유진 머리끈', 0, 36], ['baek', '백선우 안경', 0, 36], ['choi', '최옥자 묵주', 40, 80], ['haneul', '정하늘 소매', 30, 66]];
const tile = async (dir: string, id: string, y0: number, y1: number) => {
  const m = await sharp(`${dir}/${id}_idle_0.png`).metadata();
  return sharp(`${dir}/${id}_idle_0.png`).extract({ left: 0, top: y0, width: m.width!, height: y1 - y0 }).resize({ height: (y1 - y0) * 8, kernel: 'nearest' }).toBuffer();
};
const tiles: { input: Buffer; left: number; top: number }[] = []; let y = 10, maxW = 0;
for (const [id, , y0, y1] of crops) {
  const b = await tile(beforeDir, id, y0, y1), a = await tile('public/assets', id, y0, y1), mb = await sharp(b).metadata(), ma = await sharp(a).metadata();
  tiles.push({ input: b, left: 10, top: y }, { input: a, left: 10 + mb.width! + 30, top: y });
  maxW = Math.max(maxW, 10 + mb.width! + 30 + ma.width! + 10); y += Math.max(mb.height!, ma.height!) + 16;
}
await sharp({ create: { width: maxW, height: y, channels: 4, background: BG } }).composite(tiles).png().toFile(`${prefix}_detail_x8.png`);
console.log('ok');
