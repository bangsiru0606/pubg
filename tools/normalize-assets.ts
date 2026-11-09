// art/source → public/assets 정규화: 투명 여백 자르기 → 목표 높이로 축소 → 팔레트 양자화
import sharp from 'sharp';
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const SRC = 'art/source';
const OUT = 'public/assets';
const spec = JSON.parse(readFileSync('art/asset-spec.json', 'utf8'));
const manifest: Record<string, { w: number; h: number }> = {};

async function save(img: ReturnType<typeof sharp>, out: string, colours: number, id: string) {
  const { data, info } = await img.png({ palette: true, colours, dither: 0, effort: 10 }).toBuffer({ resolveWithObject: true });
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

for (const q of spec.sequences) {
  for (const f of q.frames) {
    const meta = await sharp(join(SRC, q.src, `${f}.png`)).metadata();
    const w = Math.round((meta.width! * q.canvasHeight) / meta.height!);
    await save(sharp(join(SRC, q.src, `${f}.png`)).resize(w, q.canvasHeight, { kernel: 'lanczos3' }), `${q.id}_${f}.png`, q.colours, `${q.id}_${f}`);
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
