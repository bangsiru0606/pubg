// 효과음 합성: 외부 라이브러리·외부 음원·API 없이 사인파·노이즈·엔벨로프·필터를 직접 계산해 WAV(44.1kHz, 16bit, 모노)로 쓴다.
//   npm run sfx   → art/source/audio/sfx/<이름>.wav (같은 spec 이면 항상 같은 소리: 난수 시드 고정)
// 합성 파라미터는 tools/sfx/sfx-spec.json 에만 둔다 (docs/사운드_계획.md 2장).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Layer {
  type: 'sine' | 'noise'; freq?: number | number[]; harmonics?: [number, number][]; filter?: { kind: 'lp' | 'hp' | 'bp'; freq: number | number[]; q?: number };
  start?: number; at?: number[]; atGain?: number[]; attack?: number; decay: number; dur?: number; gain?: number;
  vibrato?: { rate: number; depth: number }; tremolo?: { rate: number; depth: number };
}
export interface Master { lowpass?: number; highpass?: number; drive?: number; echo?: { delay: number; feedback: number; mix: number; count: number } }
export interface SoundSpec { duration: number; rmsDb: number; layers: Layer[]; master?: Master }
export interface Spec { sampleRate: number; seed: number; peakDb: number; fadeMs: number; sounds: Record<string, SoundSpec> }

/** 시드 고정 난수 (mulberry32) */
export function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/** 구간 보간: 값 목록을 [0,1] 구간에 고르게 놓고 로그 척도로 잇는다 */
export const sweep = (v: number | number[], p: number) => {
  if (typeof v === 'number') return v;
  if (v.length === 1) return v[0];
  const x = Math.min(Math.max(p, 0), 1) * (v.length - 1), i = Math.min(Math.floor(x), v.length - 2), f = x - i;
  return Math.exp(Math.log(v[i]) * (1 - f) + Math.log(v[i + 1]) * f);
};

/** RBJ 바이쿼드 (2차 IIR) */
export class Biquad {
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0; private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  constructor(private kind: 'lp' | 'hp' | 'bp', private sr: number) {}
  set(freq: number, q = 0.707) {
    const w = (2 * Math.PI * Math.min(freq, this.sr * 0.45)) / this.sr, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
    if (this.kind === 'lp') { this.b0 = (1 - c) / 2 / a0; this.b1 = (1 - c) / a0; this.b2 = this.b0; }
    else if (this.kind === 'hp') { this.b0 = (1 + c) / 2 / a0; this.b1 = -(1 + c) / a0; this.b2 = this.b0; }
    else { this.b0 = al / a0; this.b1 = 0; this.b2 = -al / a0; }
    this.a1 = (-2 * c) / a0; this.a2 = (1 - al) / a0;
  }
  run(x: number) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
}

function renderLayer(out: Float64Array, l: Layer, start: number, gain: number, sr: number, rand: () => number) {
  const attack = Math.max(l.attack ?? 0.002, 1 / sr), dur = l.dur ?? attack + l.decay * 6, n = Math.min(Math.floor(dur * sr), out.length - Math.floor(start * sr)), s0 = Math.floor(start * sr);
  const f = l.filter ? new Biquad(l.filter.kind, sr) : null;
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, p = i / Math.max(n - 1, 1);
    let env = t < attack ? t / attack : Math.exp(-(t - attack) / l.decay);
    env *= Math.min(1, (dur - t) / 0.004); // 끝에서 4ms 안에 0 으로 (딸깍 방지)
    if (l.tremolo) env *= 1 - l.tremolo.depth * (0.5 - 0.5 * Math.cos(2 * Math.PI * l.tremolo.rate * t));
    let x: number;
    if (l.type === 'sine') {
      const fr = sweep(l.freq ?? 440, p) + (l.vibrato ? l.vibrato.depth * Math.sin(2 * Math.PI * l.vibrato.rate * t) : 0);
      phase += (2 * Math.PI * fr) / sr;
      x = Math.sin(phase); for (const [m, g] of l.harmonics ?? []) x += g * Math.sin(phase * m);
    } else {
      x = rand() * 2 - 1;
      if (f) { if (i % 32 === 0) f.set(sweep(l.filter!.freq, p), l.filter!.q ?? 0.707); x = f.run(x); if (l.filter!.kind === 'bp') x *= 2; }
    }
    out[s0 + i] += x * env * gain;
  }
}

/** 한 소리를 합성해 -1~1 샘플로 돌려준다 (rmsDb 목표와 피크 상한은 맞춘 뒤) */
export function synth(name: string, sp: SoundSpec, spec: Pick<Spec, 'sampleRate' | 'seed' | 'peakDb' | 'fadeMs'>): Float64Array {
  const sr = spec.sampleRate, buf = new Float64Array(Math.round(sp.duration * sr));
  sp.layers.forEach((l, k) => {
    const rand = rng(spec.seed ^ hash(name) ^ (k * 7919));
    const starts = l.at ?? [l.start ?? 0];
    starts.forEach((s, j) => renderLayer(buf, l, s, (l.gain ?? 1) * (l.atGain?.[j] ?? 1), sr, rand));
  });
  const m = sp.master ?? {};
  let x = buf;
  if (m.highpass) { const f = new Biquad('hp', sr); f.set(m.highpass); x = x.map((v) => f.run(v)); }
  if (m.lowpass) { const f = new Biquad('lp', sr); f.set(m.lowpass); x = x.map((v) => f.run(v)); }
  if (m.echo) { const d = Math.round(m.echo.delay * sr), y = Float64Array.from(x); for (let k = 1; k <= m.echo.count; k++) for (let i = k * d; i < x.length; i++) y[i] += x[i - k * d] * m.echo.mix * Math.pow(m.echo.feedback, k - 1); x = y; }
  if (m.drive) { const pk = x.reduce((a, v) => Math.max(a, Math.abs(v)), 1e-9); x = x.map((v) => Math.tanh((v / pk) * m.drive!) / Math.tanh(m.drive!)); }
  const fade = Math.max(1, Math.round((spec.fadeMs / 1000) * sr)); // 앞뒤 페이드 (클릭 잡음 방지)
  x = x.map((v, i) => v * Math.min(1, i / fade, (x.length - 1 - i) / fade));
  // 소리가 나는 구간의 RMS 를 목표에 맞춘다 (10ms 블록 중 피크 -40dB 이상만 센다), 피크는 peakDb 이하로
  const pk = x.reduce((a, v) => Math.max(a, Math.abs(v)), 1e-9), blk = Math.round(0.01 * sr);
  let e = 0, nb = 0;
  for (let i = 0; i + blk <= x.length; i += blk) { let s = 0; for (let j = 0; j < blk; j++) s += x[i + j] ** 2; const r = Math.sqrt(s / blk); if (r > pk * 0.01) { e += s / blk; nb++; } }
  const rms = Math.sqrt(e / Math.max(nb, 1)) || 1e-9;
  let g = 10 ** (sp.rmsDb / 20) / rms; if (pk * g > 10 ** (spec.peakDb / 20)) g = 10 ** (spec.peakDb / 20) / pk;
  return x.map((v) => v * g);
}

export function wavBytes(x: Float64Array, sr: number): Buffer {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  x.forEach((v, i) => b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), 44 + i * 2));
  return b;
}

export const loadSpec = () => JSON.parse(readFileSync('tools/sfx/sfx-spec.json', 'utf8')) as Spec;

if (process.argv[1]?.endsWith('generate-sfx.ts')) {
  const spec = loadSpec(), dir = 'art/source/audio/sfx';
  mkdirSync(dir, { recursive: true });
  for (const [name, sp] of Object.entries(spec.sounds)) writeFileSync(join(dir, `${name}.wav`), wavBytes(synth(name, sp, spec), spec.sampleRate));
  console.log(`효과음 ${Object.keys(spec.sounds).length}개 → ${dir}/`);
}
