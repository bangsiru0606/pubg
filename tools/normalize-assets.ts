// art/source → public/assets 정규화: 투명 여백 자르기 → 목표 높이로 축소 → 팔레트 양자화
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { readFileSync as readFile } from 'node:fs';
import { normalizeAudio } from './audio-assets';
import { breatheFrame } from './breathe';
import { applyOutline, measureOutlineColor, padForOutline } from './outline';
import { binarizeAlpha, despillEdges, despillFull, removeChromaKey, trimSoftEdge } from './chroma';

/** 원본 읽기: chromaKey 지정 시 #00FF00 배경 제거 + 가장자리 초록 번짐 정리 */
const load = async (path: string, chroma?: boolean, o: { despill?: string; trimSoftEdge?: boolean } = {}): Promise<Buffer> => {
  if (!chroma) return readFileSync(path);
  let b = await despillEdges(await removeChromaKey(path));
  if (o.despill === 'full') b = await despillFull(b); // 소품 전용 (asset-spec despill: "full")
  if (o.trimSoftEdge) b = await trimSoftEdge(b);
  return b;
};

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
  const trimmed = sharp(await load(join(SRC, s.src), s.chromaKey, s)).trim({ threshold: 1 });
  const buf = await trimmed.png().toBuffer();
  let img = sharp(buf).resize({ height: s.outline ? s.height - 1 : s.height, kernel: 'lanczos3' });
  if (s.fitTo) { // 같은 자리에서 바뀌는 그림(열림/닫힘 문): 바깥 문틀 상자(= 트림한 그림 전체)를 기준 그림과 같은 가로·세로로 맞춘다 — 비율이 조금 달라도 문틀 가장자리가 겹친다
    const ref = spec.sprites.find((x: any) => x.id === s.fitTo), rm = await sharp(await sharp(await load(join(SRC, ref.src), ref.chromaKey, ref)).trim({ threshold: 1 }).png().toBuffer()).metadata();
    img = sharp(buf).resize({ width: Math.round((rm.width! * (s.height - 1)) / rm.height!), height: s.height - 1, fit: 'fill', kernel: 'lanczos3' });
  }
  if (s.outline) { // 소품: 알파 정리 → 위·좌·우 여백 1px → 바깥 외곽선 (기준 색은 한지수 스프라이트라 시퀀스 처리 뒤에 한다). 높이 규격은 유지.
    let b: Buffer = await img.png().toBuffer();
    if (s.chromaKey) b = await binarizeAlpha(b);
    if (s.despill === 'full') b = await despillFull(b); // 리사이즈 보간으로 생긴 초록기도 다시 걷어 낸다
    img = sharp(await applyOutline(await padForOutline(b), await outlineColor()));
  }
  await save(img, `${s.id}.png`, spec.colours, s.id);
}
for (const s of spec.sprites) if (!s.outline) await normalizeSprite(s);
const outlined = spec.sprites.filter((s: any) => s.outline);

/** 기준 외곽선 색: 정규화된 한지수 스프라이트(player_idle_0) 가장자리의 최빈 어두운 색 (한 번만 측정) */
let outlineRgb: [number, number, number] | null = null;
const outlineColor = async () => (outlineRgb ??= await measureOutlineColor(readFile(join(OUT, 'player_idle_0.png'))));

/** 그림에서 맨 아래 불투명 줄(발바닥)을 찾아 그 줄이 캔버스 맨 아래가 되도록 세로로만 옮긴다. 크기는 바꾸지 않는다 (머리가 내려가는 프레임도 같은 키). */
async function alignFeet(buf: Buffer, w: number, h: number): Promise<Buffer> {
  const { data } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let bottom = -1;
  for (let y = h - 1; y >= 0 && bottom < 0; y--) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 0) { bottom = y; break; }
  const dy = bottom < 0 ? 0 : h - 1 - bottom;
  if (dy === 0) return buf;
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: await sharp(buf).extract({ left: 0, top: 0, width: w, height: h - dy }).png().toBuffer(), left: 0, top: dy }]).png().toBuffer();
}

// 시퀀스: 같은 캐릭터의 모든 프레임을 가로로 이어 붙여 한 번에 양자화 → 프레임별로 다시 자름 (프레임 간 팔레트 동일)
for (const q of spec.sequences) {
  const frames = await Promise.all(q.frames.map(async (f: string) => {
    const keyed0 = !!(q.chromaKey || q.frameSrc?.[f]); // 새로 만든 그림(frameSrc, 생성 폴더)은 초록 배경을 지운다. craft_on 원본은 이미 투명
    const src = await load(join(SRC, `${q.frameSrc?.[f] ?? `${q.src}/${f}`}.png`), keyed0); // frameSrc: 같은 이름 그림의 최신판(_v2 …) 경로
    const meta = await sharp(src).metadata();
    const w = Math.round((meta.width! * q.canvasHeight) / meta.height!);
    const h = q.outline ? q.canvasHeight - 1 : q.canvasHeight; // 외곽선용 위 여백 1px 을 빼고 만든다 (캔버스 높이 90 유지)
    const k = q.frameSrc?.[f] && q.walkScale ? q.walkScale : 1; // walkScale: 새 걷기 그림과 craft_on 대기 그림의 몸 높이 차를 맞추는 배율 (캔버스 높이는 그대로, 넘치는 부분은 위·옆을 자른다)
    const resized = await sharp(src).resize(Math.round(w * k), Math.round(h * k), { kernel: 'lanczos3' }).png().toBuffer();
    let keyed = keyed0 ? await binarizeAlpha(resized) : resized;
    if (q.alignFeet) keyed = await alignFeet(keyed, Math.round(w * k), Math.round(h * k)); // 걷기 프레임: 같은 배율 그대로, 발 하단 줄을 캔버스 바닥선에 맞춘다
    if (k !== 1) { const W2 = Math.round(w * k), H2 = Math.round(h * k); keyed = await sharp(keyed).extract({ left: Math.floor((W2 - w) / 2), top: H2 - h, width: w, height: h }).png().toBuffer(); }
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
/**
 * 일러스트(초상·근접 조사·편지·컷신)는 화면 최대 표시 크기 × 1.5 를 넘지 않게 줄여 WebP(품질 85)로 저장한다. 원본(art/source)은 그대로 둔다.
 *  - 초상: 1920×1080 에서 액자 높이(104 논리 px × 4 = 416) × 1.5 = 624px
 *  - 근접 조사 소품 아이콘(hat·calendar): 화면 표시 폭 약 260px × 1.5 → 400px
 *  - 그 밖(책상 배경·확대 그림·편지·컷신): 전체 화면 기준 최대 1920 폭 (확대하지 않는다)
 */
const ICON_NAMES = ['hat.png', 'calendar.png'];
async function emitIllust(file: string, name: string, portrait: boolean) {
  const img = sharp(file);
  const fit = portrait ? { height: 624 } : ICON_NAMES.includes(name) ? { width: 400 } : { width: 1920 };
  await img.resize({ ...fit, withoutEnlargement: true, kernel: 'lanczos3' }).webp({ quality: 85, effort: 6 }).toFile(join(OUT, 'illust', name.replace(/\.png$/, '.webp')));
}
for (const p of spec.illust as string[]) {
  if (p.endsWith('/*.png')) {
    const dir = p.slice(0, -6);
    for (const f of readdirSync(join(SRC, dir))) if (!isPendingPortrait(f) && !(spec.illustExclude ?? []).includes(f)) await emitIllust(join(SRC, dir, f), f, /portraits/i.test(dir)); // 승인 전(pending) 인물의 초상은 넣지 않는다
  } else await emitIllust(join(SRC, p), basename(p), false);
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
writeFileSync('src/data/illust-list.json', JSON.stringify(readdirSync(join(OUT, 'illust')).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)).sort()));
writeFileSync(join(OUT, 'assets.json'), JSON.stringify(manifest, null, 1));
const au = normalizeAudio();
for (const w of au.warnings) console.warn(`! 소리 경고 — ${w}`);
if (au.stats.length) { // BGM 음량·길이 표 (전 → 후)
  const f = (n: number | undefined) => (n === undefined || Number.isNaN(n) ? '-' : n.toFixed(1));
  console.log('BGM 재인코딩 (통합 음량 LUFS / 참 피크 dBTP / 길이 초)');
  for (const t of au.stats) console.log(`  ${t.name.padEnd(18)} ${f(t.before?.i).padStart(6)} → ${f(t.after?.i).padStart(6)} LUFS · 피크 ${f(t.before?.tp).padStart(5)} → ${f(t.after?.tp).padStart(5)} · ${f(t.srcSec).padStart(6)}s → ${f(t.outSec).padStart(6)}s${t.loop ? ` (반복 · 시작 +${f(t.trimStart)}s · 끝 -${f(t.trimEnd)}s)` : ' (반복 안 함)'}`);
  mkdirSync('.tmp', { recursive: true }); writeFileSync('.tmp/audio-report.json', JSON.stringify(au.stats, null, 1));
}
console.log(`assets: ${Object.keys(manifest).length} normalized, audio: BGM ${au.list.bgm.length}곡 · 효과음 ${au.list.sfx.length}개 (${(au.total / 1048576).toFixed(1)}MB, 재인코딩 ${au.reencoded}·복사 ${au.copied}, ${au.ffmpeg ? 'ffmpeg' : 'ffmpeg 없음'})`);
