// art/source → public/assets 정규화: 투명 여백 자르기 → 목표 높이로 축소 → 팔레트 양자화
import sharp from 'sharp';
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { readFileSync as readFile } from 'node:fs';
import { breatheFrame } from './breathe';
import { applyOutline, measureOutlineColor, padForOutline } from './outline';
import { binarizeAlpha, despillEdges, removeChromaKey } from './chroma';

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

async function normalizeSprite(s: any) {
  const trimmed = sharp(await load(join(SRC, s.src), s.chromaKey)).trim({ threshold: 1 });
  const buf = await trimmed.png().toBuffer();
  let img = sharp(buf).resize({ height: s.outline ? s.height - 1 : s.height, kernel: 'lanczos3' });
  if (s.outline) { // 소품: 알파 정리 → 위·좌·우 여백 1px → 바깥 외곽선 (기준 색은 한지수 스프라이트라 시퀀스 처리 뒤에 한다). 높이 규격은 유지.
    let b: Buffer = await img.png().toBuffer();
    if (s.chromaKey) b = await binarizeAlpha(b);
    img = sharp(await applyOutline(await padForOutline(b), await outlineColor()));
  }
  await save(img, `${s.id}.png`, spec.colours, s.id);
}
for (const s of spec.sprites) if (!s.outline) await normalizeSprite(s);
const outlined = spec.sprites.filter((s: any) => s.outline);

/** 기준 외곽선 색: 정규화된 한지수 스프라이트(player_idle_0) 가장자리의 최빈 어두운 색 (한 번만 측정) */
let outlineRgb: [number, number, number] | null = null;
const outlineColor = async () => (outlineRgb ??= await measureOutlineColor(readFile(join(OUT, 'player_idle_0.png'))));

// 시퀀스: 같은 캐릭터의 모든 프레임을 가로로 이어 붙여 한 번에 양자화 → 프레임별로 다시 자름 (프레임 간 팔레트 동일)
for (const q of spec.sequences) {
  const frames = await Promise.all(q.frames.map(async (f: string) => {
    const src = await load(join(SRC, q.src, `${f}.png`), q.chromaKey);
    const meta = await sharp(src).metadata();
    const w = Math.round((meta.width! * q.canvasHeight) / meta.height!);
    const h = q.outline ? q.canvasHeight - 1 : q.canvasHeight; // 외곽선용 위 여백 1px 을 빼고 만든다 (캔버스 높이 90 유지)
    const resized = await sharp(src).resize(w, h, { kernel: 'lanczos3' }).png().toBuffer();
    const keyed = q.chromaKey ? await binarizeAlpha(resized) : resized;
    if (!q.outline) return { f, w, buf: keyed };
    return { f, w: w + 2, buf: await applyOutline(await padForOutline(keyed), await outlineColor()) }; // 좌우 여백 1px 씩 // 외곽선 보정은 숨쉬기 프레임을 만들기 전에 적용한다
  }));
  if (q.breathe) frames.push({ f: 'idle_1', w: frames[0].w, buf: await breatheFrame(frames[0].buf) }); // idle_0 한 장에서 숨쉬기 프레임을 만든다
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

for (const s of outlined) await normalizeSprite(s);

// 생성 대기(pending) 중인 인물의 초상은 아직 승인·적용 전이므로 게임에 넣지 않는다 (import-generated --apply 가 pending 을 지우면 들어간다)
const pendingBases = (JSON.parse(readFileSync('src/data/characters.json', 'utf8')).characters as { portrait: string | null; pending?: boolean }[]).filter((c) => c.pending && c.portrait).map((c) => `${c.portrait}_`);
const isPendingPortrait = (file: string) => pendingBases.some((b) => file.startsWith(b));

// 클로즈업·초상·컷신은 정규화하지 않고 그대로 복사
for (const p of spec.illust as string[]) {
  if (p.endsWith('/*.png')) {
    const dir = p.slice(0, -6);
    for (const f of readdirSync(join(SRC, dir))) if (!isPendingPortrait(f)) cpSync(join(SRC, dir, f), join(OUT, 'illust', f)); // 승인 전(pending) 인물의 초상은 복사하지 않는다
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
writeFileSync('src/data/illust-list.json', JSON.stringify(readdirSync(join(OUT, 'illust')).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)).sort()));
writeFileSync(join(OUT, 'assets.json'), JSON.stringify(manifest, null, 1));
console.log(`assets: ${Object.keys(manifest).length} normalized`);
