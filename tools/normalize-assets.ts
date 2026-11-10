// art/source → public/assets 정규화: 투명 여백 자르기 → 목표 높이로 축소 → 팔레트 양자화
import sharp from 'sharp';
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { despillEdges, removeChromaKey } from './chroma';

/** 원본 읽기: chromaKey 지정 시 #00FF00 배경 제거 + 가장자리 초록 번짐 정리 */
const load = async (path: string, chroma?: boolean): Promise<Buffer> => (chroma ? despillEdges(await removeChromaKey(path)) : readFileSync(path));

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
  const trimmed = sharp(await load(join(SRC, s.src), s.chromaKey)).trim({ threshold: 1 });
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
// 근접 조사 소품: 투명 여백을 뺀 실제 그림 영역(bbox)과 클릭 판정용 마스크(40열)를 src/data/illust-masks.json 에 쓴다 (file:// 에서는 캔버스로 읽을 수 없다)
const masks: Record<string, unknown> = {};
for (const p of (spec.masks ?? []) as string[]) {
  const { data, info } = await sharp(join(SRC, p)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 20) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, cols = 40, rows = Math.max(1, Math.round((cols * bh) / bw));
  const bits: string[] = [];
  for (let r = 0; r < rows; r++) {
    let row = '';
    for (let c = 0; c < cols; c++) {
      let hit = 0;
      const sx = x0 + Math.floor((c * bw) / cols), ex = x0 + Math.max(Math.floor(((c + 1) * bw) / cols), Math.floor((c * bw) / cols) + 1) ;
      const sy = y0 + Math.floor((r * bh) / rows), ey = y0 + Math.max(Math.floor(((r + 1) * bh) / rows), Math.floor((r * bh) / rows) + 1);
      for (let y = sy; y < ey && !hit; y++) for (let x = sx; x < ex; x++) if (data[(y * info.width + x) * 4 + 3] > 40) { hit = 1; break; }
      row += hit ? '1' : '0';
    }
    bits.push(row);
  }
  masks[basename(p, '.png')] = { W: info.width, H: info.height, x: x0, y: y0, w: bw, h: bh, bits };
}
writeFileSync('src/data/illust-masks.json', JSON.stringify(masks));
writeFileSync(join(OUT, 'assets.json'), JSON.stringify(manifest, null, 1));
console.log(`assets: ${Object.keys(manifest).length} normalized`);
