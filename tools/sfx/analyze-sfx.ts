// 효과음 객관 검사: 길이·피크·RMS·스펙트럼 중심·대역 비율·앞뒤 클릭을 표로, 파형+스펙트로그램을 한 장으로 → docs/screenshots/sfx_sheet.png
//   npm run sfx:report   (미리듣기 파일도 만든다: .tmp/sfx_preview.wav + .tmp/sfx_preview.txt)
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { wavBytes } from './generate-sfx';

export function readWav(path: string): { sr: number; x: Float64Array } {
  const b = readFileSync(path); let p = 12, sr = 44100;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), n = b.readUInt32LE(p + 4);
    if (id === 'fmt ') sr = b.readUInt32LE(p + 12);
    if (id === 'data') { const m = Math.min(n, b.length - p - 8) / 2, x = new Float64Array(m); for (let i = 0; i < m; i++) x[i] = b.readInt16LE(p + 8 + i * 2) / 32768; return { sr, x }; }
    p += 8 + n + (n % 2);
  }
  throw new Error(`${path}: data 청크가 없다`);
}

/** radix-2 FFT (제자리). re/im 길이는 2의 거듭제곱 */
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/** STFT 크기 스펙트럼: frames × bins (Hann 창, 512, hop 256) */
export function stft(x: Float64Array, size = 512, hop = 256): Float64Array[] {
  const frames: Float64Array[] = [];
  for (let s = 0; s + size <= Math.max(x.length, size); s += hop) {
    const re = new Float64Array(size), im = new Float64Array(size);
    for (let i = 0; i < size; i++) re[i] = (x[s + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
    fft(re, im);
    frames.push(Float64Array.from({ length: size / 2 }, (_, k) => Math.hypot(re[k], im[k])));
  }
  return frames;
}

export interface Stat { name: string; sec: number; peakDb: number; rmsDb: number; centroid: number; low: number; high: number; edgeStart: number; edgeEnd: number; stepStart: number; stepEnd: number }
const db = (v: number) => 20 * Math.log10(Math.max(v, 1e-9));
export function analyze(name: string, x: Float64Array, sr: number): Stat {
  const peak = x.reduce((a, v) => Math.max(a, Math.abs(v)), 0), blk = Math.round(0.01 * sr);
  let e = 0, nb = 0;
  for (let i = 0; i + blk <= x.length; i += blk) { let s = 0; for (let j = 0; j < blk; j++) s += x[i + j] ** 2; if (Math.sqrt(s / blk) > peak * 0.01) { e += s / blk; nb++; } }
  const fr = stft(x), mean = new Float64Array(256); for (const f of fr) f.forEach((v, k) => { mean[k] += v * v; });
  let tot = 0, wsum = 0, lo = 0, hi = 0;
  mean.forEach((p, k) => { const hz = (k * sr) / 512; tot += p; wsum += p * hz; if (hz < 400) lo += p; if (hz >= 2000) hi += p; });
  const k3 = Math.round(0.003 * sr);
  const maxStep = (a: number, b: number) => { let m = 0; for (let i = a + 1; i < b; i++) m = Math.max(m, Math.abs(x[i] - x[i - 1])); return m; };
  return { name, sec: x.length / sr, peakDb: db(peak), rmsDb: db(Math.sqrt(e / Math.max(nb, 1))), centroid: wsum / Math.max(tot, 1e-12), low: lo / Math.max(tot, 1e-12), high: hi / Math.max(tot, 1e-12),
    edgeStart: Math.abs(x[0]), edgeEnd: Math.abs(x[x.length - 1]), stepStart: maxStep(0, k3), stepEnd: maxStep(x.length - k3, x.length) };
}

if (process.argv[1]?.endsWith('analyze-sfx.ts')) {
  const dir = 'art/source/audio/sfx', files = readdirSync(dir).filter((f) => f.endsWith('.wav')).sort();
  const items = files.map((f) => ({ name: f.slice(0, -4), ...readWav(`${dir}/${f}`) }));
  const stats = items.map((it) => analyze(it.name, it.x, it.sr));
  console.log('이름               길이s  피크dBFS  RMS dBFS  중심Hz  <400Hz  >2kHz  첫샘플  끝샘플  첫3ms최대step  끝3ms최대step');
  for (const s of stats) console.log(`${s.name.padEnd(17)} ${s.sec.toFixed(2).padStart(5)}  ${s.peakDb.toFixed(1).padStart(8)}  ${s.rmsDb.toFixed(1).padStart(8)}  ${s.centroid.toFixed(0).padStart(6)}  ${(s.low * 100).toFixed(0).padStart(5)}%  ${(s.high * 100).toFixed(0).padStart(4)}%  ${s.edgeStart.toExponential(0).padStart(6)}  ${s.edgeEnd.toExponential(0).padStart(6)}  ${s.stepStart.toExponential(1).padStart(10)}  ${s.stepEnd.toExponential(1).padStart(12)}`);
  mkdirSync('.tmp', { recursive: true }); mkdirSync('docs/screenshots', { recursive: true });
  writeFileSync('.tmp/sfx-report.json', JSON.stringify(stats, null, 1));

  // 시트: 소리마다 파형(위) + 스펙트로그램(아래, 0~8kHz, 로그 밝기)
  const W = 360, WH = 44, SH = 76, LBL = 16, CELL_H = LBL + WH + SH + 6, COLS = 4, rows = Math.ceil(items.length / COLS);
  const SW = COLS * (W + 8) + 8, SHH = rows * CELL_H + 8, img = Buffer.alloc(SW * SHH * 3, 24);
  const put = (x: number, y: number, r: number, g: number, b: number) => { const o = (y * SW + x) * 3; img[o] = r; img[o + 1] = g; img[o + 2] = b; };
  const labels: string[] = [];
  items.forEach((it, idx) => {
    const ox = 8 + (idx % COLS) * (W + 8), oy = 8 + Math.floor(idx / COLS) * CELL_H;
    for (let y = 0; y < WH; y++) for (let x = 0; x < W; x++) put(ox + x, oy + LBL + y, 36, 34, 40);
    for (let x = 0; x < W; x++) { // 파형: 열마다 최대 진폭
      const a = Math.floor((x * it.x.length) / W), b = Math.max(a + 1, Math.floor(((x + 1) * it.x.length) / W)); let m = 0;
      for (let i = a; i < b; i++) m = Math.max(m, Math.abs(it.x[i]));
      const h = Math.round(m * (WH / 2 - 1)); for (let y = -h; y <= h; y++) put(ox + x, oy + LBL + WH / 2 + y, 226, 201, 138);
    }
    const fr = stft(it.x), bins = 186; // 0~8kHz
    for (let y = 0; y < SH; y++) for (let x = 0; x < W; x++) {
      const f = fr[Math.min(fr.length - 1, Math.floor((x * fr.length) / W))], k = Math.min(bins - 1, Math.floor(((SH - 1 - y) * bins) / SH)), v = Math.max(0, Math.min(1, (db(f[k] / 20) + 70) / 60));
      put(ox + x, oy + LBL + WH + y, Math.round(20 + 235 * v * v), Math.round(16 + 180 * v), Math.round(40 + 120 * (1 - v) * v + 90 * v * v * v));
    }
    const s = stats[idx];
    labels.push(`<text x="${ox + 1}" y="${oy + 12}" font-size="12" fill="#e8dcc0" font-family="monospace">${it.name}  ${s.sec.toFixed(2)}s  pk ${s.peakDb.toFixed(1)}  rms ${s.rmsDb.toFixed(1)}  ${s.centroid.toFixed(0)}Hz</text>`);
  });
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SHH}">${labels.join('')}</svg>`);
  await sharp(img, { raw: { width: SW, height: SHH, channels: 3 } }).composite([{ input: svg }]).png().toFile('docs/screenshots/sfx_sheet.png');

  // 미리듣기: 계획서 2.2 순서대로 18종(변주가 있는 것은 _1)을 0.7초 간격으로 이어 붙인다 (커밋하지 않는다)
  const order = ['knock', 'door_open', 'door_close', 'stairs', 'gate_clank', 'footstep_1', 'page_flip', 'evidence_get', 'statement_update', 'puzzle_correct', 'puzzle_wrong', 'hint', 'ui_move', 'ui_confirm', 'type_blip_1', 'broadcast_chime', 'heartbeat', 'transfer_done', 'fade_whoosh'];
  const sr = items[0].sr, gap = Math.round(0.7 * sr), parts: Float64Array[] = [];
  let at = 0; const lines: string[] = [];
  for (const n of order) { const it = items.find((q) => q.name === n)!; lines.push(`${(at / sr).toFixed(2)}s  ${n}`); parts.push(it.x, new Float64Array(gap)); at += it.x.length + gap; }
  const all = new Float64Array(at); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  writeFileSync('.tmp/sfx_preview.wav', wavBytes(all, sr)); writeFileSync('.tmp/sfx_preview.txt', lines.join('\n') + '\n');
  console.log(`\n시트 docs/screenshots/sfx_sheet.png, 미리듣기 .tmp/sfx_preview.wav (${(at / sr).toFixed(1)}초)`);
}
