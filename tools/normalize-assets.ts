// art/source → public/assets 정규화: 투명 여백 자르기 → 목표 높이로 축소 → 팔레트 양자화
import sharp from 'sharp';
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const SRC = 'art/source';
const OUT = 'public/assets';
const spec = JSON.parse(readFileSync('art/asset-spec.json', 'utf8'));
const manifest: Record<string, { w: number; h: number }> = {};

async function save(img: ReturnType<typeof sharp>, out: string, colours: number, id: string, quality = 50) {
  // colours=256: 이미 양자화된 이미지를 색 변경 없이 팔레트 PNG로만 저장
  const { data, info } = await img.png({ palette: true, colours, quality, dither: 0, effort: 10 }).toBuffer({ resolveWithObject: true });
  writeFileSync(join(OUT, out), data);
  manifest[id] = { w: info.width, h: info.height };
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'illust'), { recursive: true });

for (const s of spec.sprites) {
  const trimmed = sharp(join(SRC, s.src)).trim({ threshold: 1 });
  const buf = await trimmed.png().toBuffer();
  await save(sharp(buf).resize({ height: s.height, kernel: 'lanczos3' }), `${s.id}.png`, spec.colours, s.id);
}

// 시퀀스: 같은 캐릭터의 모든 프레임을 가로로 이어 붙여 한 번에 양자화 → 프레임별로 다시 자름 (프레임 간 팔레트 동일)
for (const q of spec.sequences) {
  const frames = await Promise.all(q.frames.map(async (f: string) => {
    const meta = await sharp(join(SRC, q.src, `${f}.png`)).metadata();
    const w = Math.round((meta.width! * q.canvasHeight) / meta.height!);
    return { f, w, buf: await sharp(join(SRC, q.src, `${f}.png`)).resize(w, q.canvasHeight, { kernel: 'lanczos3' }).png().toBuffer() };
  }));
  const total = frames.reduce((a, x) => a + x.w, 0);
  let left = 0;
  const strip = await sharp({ create: { width: total, height: q.canvasHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(frames.map((x) => { const c = { input: x.buf, left, top: 0 }; left += x.w; return c; }))
    .png({ palette: true, colours: q.colours, quality: 50, dither: 0, effort: 10 }).toBuffer();
  left = 0;
  for (const x of frames) {
    await save(sharp(strip).extract({ left, top: 0, width: x.w, height: q.canvasHeight }), `${q.id}_${x.f}.png`, 256, `${q.id}_${x.f}`, 100);
    left += x.w;
  }
}

// 클로즈업·초상·컷신은 정규화하지 않고 그대로 복사
for (const p of spec.illust as string[]) {
  if (p.endsWith('/*.png')) {
    const dir = p.slice(0, -6);
    for (const f of readdirSync(join(SRC, dir))) cpSync(join(SRC, dir, f), join(OUT, 'illust', f));
  } else cpSync(join(SRC, p), join(OUT, 'illust', basename(p)));
}
writeFileSync(join(OUT, 'assets.json'), JSON.stringify(manifest, null, 1));
console.log(`assets: ${Object.keys(manifest).length} normalized`);
