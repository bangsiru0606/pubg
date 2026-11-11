// art/source/audio → public/assets/audio 정규화 (npm run assets 가 부른다).
//   bgm/*.mp3 → audio/bgm/ (MP3 96kbps 스테레오 44.1kHz 로 재인코딩), sfx/*.wav → audio/sfx/ (1초 이상이면 OGG, 아니면 그대로 복사)
//   재인코딩은 devDependency ffmpeg-static 으로 한다 (제출 빌드에는 들어가지 않는다). 없으면 원본 복사.
//   bgm/CREDITS.md → src/data/bgm-credits.json (타이틀 "정보"에 표시), 있는 파일 목록 → src/data/audio-list.json
//   소리 전체가 16MB 를 넘으면 실패하고, 150초를 넘는 곡은 경고한다.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import audioData from '../src/data/audio.json' with { type: 'json' };
import { join } from 'node:path';

export const AUDIO_BUDGET = 16 * 1024 * 1024;
export const BGM_MAX_SECONDS = 150; // 이보다 긴 곡은 경고 (실패 아님)

/** CREDITS.md → 화면에 보일 줄들 (제목·표 서식·강조 기호를 걷어 낸다) */
export function parseCredits(md: string): string[] {
  return md.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !/^[-|:\s]+$/.test(l))
    .map((l) => l.replace(/^[-*]\s+/, '').replace(/\*\*|`/g, '').replace(/^\||\|$/g, '').replace(/\s*\|\s*/g, ' · ').trim()).filter(Boolean);
}

/** ffmpeg: devDependency ffmpeg-static 의 실행 파일을 쓴다 (없으면 시스템 ffmpeg, 둘 다 없으면 null → 원본 복사) */
export function findFfmpeg(): string | null {
  try { const p = createRequire(import.meta.url)('ffmpeg-static') as string | null; if (p && existsSync(p)) return p; } catch { /* 설치 안 됨 */ }
  return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0 ? 'ffmpeg' : null;
}
/** PCM WAV 길이(초): 헤더의 byteRate 와 data 크기로 계산 */
export function wavSeconds(buf: Buffer): number {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF') return 0;
  let p = 12, rate = 0;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4), n = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') rate = buf.readUInt32LE(p + 16);
    if (id === 'data') return rate ? Math.min(n, buf.length - p - 8) / rate : 0;
    p += 8 + n + (n % 2);
  }
  return 0;
}
/** ffmpeg -i 출력의 "Duration: hh:mm:ss.xx" 를 초로 (실패하면 0) */
export function durationOf(ff: string | null, file: string): number {
  if (!ff) return 0;
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(spawnSync(ff, ['-i', file], { encoding: 'utf8' }).stderr ?? '');
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
}
export const OGG_MIN_SECONDS = 1; // 이 길이 이상의 효과음은 OGG(Vorbis)로 줄인다

// ---- BGM: 2-pass loudnorm(-23 LUFS, 참 피크 -2 dBTP 이하) + 반복 곡의 앞뒤 무음 정리 ----
export const BGM_LUFS = -23, BGM_TP_LIMIT = -2;
export interface Loud { i: number; tp: number; lra: number; thresh: number; offset: number }
/** ffmpeg loudnorm(print_format=json) 출력에서 측정값을 읽는다 */
export function parseLoudnorm(stderr: string): Loud | null {
  const blocks = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/g);
  if (!blocks) return null;
  try { const j = JSON.parse(blocks[blocks.length - 1]); return { i: +j.input_i, tp: +j.input_tp, lra: +j.input_lra, thresh: +j.input_thresh, offset: +j.target_offset }; } catch { return null; }
}
/** 앞·뒤의 거의 무음(-45dB 미만)만 걷어 낸다. 곡 중간의 조용한 구간은 그대로 둔다. */
export const TRIM_FILTER = 'silenceremove=start_periods=1:start_threshold=-45dB:detection=peak,areverse,silenceremove=start_periods=1:start_threshold=-45dB:detection=peak,areverse';
/** 원본의 앞·뒤 무음 길이(초): silencedetect -45dB, 0.3초 이상인 구간만 */
export function edgeSilence(ff: string, file: string, dur: number): { start: number; end: number } {
  const t = spawnSync(ff, ['-hide_banner', '-i', file, '-af', 'silencedetect=noise=-45dB:d=0.3', '-f', 'null', '-'], { encoding: 'utf8' }).stderr ?? '';
  const starts = [...t.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]), ends = [...t.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  const start = starts[0] !== undefined && starts[0] < 0.05 && ends[0] !== undefined ? ends[0] : 0;
  const lastStart = starts[starts.length - 1], tail = lastStart !== undefined && (ends.length < starts.length || dur - ends[ends.length - 1] < 0.05) ? dur - lastStart : 0;
  return { start, end: tail };
}
export interface BgmStat { name: string; loop: boolean; srcSec: number; outSec: number; trimmed: boolean; trimStart: number; trimEnd: number; before: { i: number; tp: number } | null; after: { i: number; tp: number } | null }

function measure(ff: string, file: string, pre: string): Loud | null {
  const af = `${pre ? pre + ',' : ''}loudnorm=I=${BGM_LUFS}:TP=${BGM_TP_LIMIT}:LRA=11:print_format=json`;
  return parseLoudnorm(spawnSync(ff, ['-hide_banner', '-nostats', '-i', file, '-af', af, '-f', 'null', '-'], { encoding: 'utf8' }).stderr ?? '');
}
/** 한 곡을 재인코딩한다 (원본은 건드리지 않는다). 성공하면 통계를 돌려준다. */
export function encodeBgm(ff: string, from: string, to: string, name: string, loop: boolean): BgmStat | null {
  const pre = loop ? TRIM_FILTER : '';
  const before = measure(ff, from, ''), m = measure(ff, from, pre);
  if (!m) return null;
  const encode = (tp: number, gain: number) => spawnSync(ff, ['-y', '-loglevel', 'error', '-i', from, '-vn', '-af',
    `${pre ? pre + ',' : ''}loudnorm=I=${BGM_LUFS}:TP=${tp}:LRA=11:measured_I=${m.i}:measured_TP=${m.tp}:measured_LRA=${m.lra}:measured_thresh=${m.thresh}:offset=${m.offset}:linear=true${gain ? `,volume=${gain.toFixed(2)}dB` : ''},aresample=44100`,
    '-c:a', 'libmp3lame', '-b:a', '96k', '-ac', '2', '-ar', '44100', to]).status === 0;
  // loudnorm 은 파형이 넓게 움직이는 곡에서 목표를 조금 비껴가므로, 결과를 다시 재서 ±0.4 LU 안으로 보정한다 (피크 -2 dBTP 한도 안에서)
  let gain = 0;
  if (!encode(BGM_TP_LIMIT - 0.5, gain)) return null; // MP3 로 다시 압축하면 피크가 조금 오르므로 여유를 둔다
  let after = measure(ff, to, '');
  for (let k = 0; k < 4 && after; k++) {
    const need = BGM_LUFS - after.i;
    if (after.tp > BGM_TP_LIMIT) gain -= after.tp - BGM_TP_LIMIT + 0.2;
    else if (Math.abs(need) > 0.4 && after.tp + need <= BGM_TP_LIMIT - 0.1) gain += need;
    else break;
    if (!encode(BGM_TP_LIMIT - 0.5, gain)) return null;
    after = measure(ff, to, '');
  }
  return { name, loop, srcSec: durationOf(ff, from), outSec: durationOf(ff, to), trimmed: loop, ...(loop ? (() => { const e = edgeSilence(ff, from, durationOf(ff, from)); return { trimStart: e.start, trimEnd: e.end }; })() : { trimStart: 0, trimEnd: 0 }), before: before && { i: before.i, tp: before.tp }, after: after && { i: after.i, tp: after.tp } };
}

export function normalizeAudio(src = 'art/source/audio', out = 'public/assets/audio') {
  const list = { bgm: [] as string[], sfx: [] as string[], ext: {} as Record<string, string> };
  const info = { reencoded: 0, copied: 0, ogg: 0 }, warnings: string[] = [], stats: BgmStat[] = [];
  let total = 0;
  const ff = findFfmpeg();
  const run = (args: string[]) => !!ff && spawnSync(ff, ['-y', '-loglevel', 'error', ...args]).status === 0;
  for (const [kind, ext] of [['bgm', 'mp3'], ['sfx', 'wav']] as const) {
    const dir = join(src, kind);
    if (!existsSync(dir)) continue;
    mkdirSync(join(out, kind), { recursive: true });
    for (const f of readdirSync(dir).filter((x) => x.toLowerCase().endsWith(`.${ext}`)).sort()) {
      const name = f.slice(0, -ext.length - 1), from = join(dir, f);
      let to = join(out, kind, `${name}.${ext}`), done = false;
      if (kind === 'bgm') { const sec = durationOf(ff, from); if (sec > BGM_MAX_SECONDS) warnings.push(`${name}: ${Math.round(sec)}초 — 150초를 넘는다 (용량 예산을 많이 쓴다)`); }
      if (kind === 'bgm' && ff) { const st = encodeBgm(ff, from, to, name, (audioData.bgm.tracks as Record<string, { loop?: boolean }>)[name]?.loop !== false); if (st) { done = true; stats.push(st); } } // 원본은 그대로, 결과는 public 에만
      else if (wavSeconds(readFileSync(from)) >= OGG_MIN_SECONDS) {
        const ogg = join(out, kind, `${name}.ogg`);
        if (run(['-i', from, '-c:a', 'libvorbis', '-q:a', '4', ogg])) { to = ogg; done = true; list.ext[name] = 'ogg'; info.ogg++; }
      }
      if (done) info.reencoded++; else { copyFileSync(from, to); info.copied++; }
      total += statSync(to).size; list[kind].push(name);
    }
  }
  if (total > AUDIO_BUDGET) throw new Error(`소리 용량 ${(total / 1048576).toFixed(1)}MB 가 예산 16MB 를 넘는다`);
  const credits = join(src, 'bgm', 'CREDITS.md');
  writeFileSync('src/data/bgm-credits.json', JSON.stringify(existsSync(credits) ? parseCredits(readFileSync(credits, 'utf8')) : []));
  writeFileSync('src/data/audio-list.json', JSON.stringify(list));
  return { list, total, ffmpeg: ff, warnings, stats, ...info };
}

interface AudioData { bgm: { tracks: Record<string, unknown>; fallback: Record<string, string>; scene: Record<string, string>; area: Record<string, string>; dialogue: Record<string, string>; puzzle: string; ending: Record<string, string> }; sfx: { sounds: Record<string, unknown>; events: Record<string, string>; nodeEvents: Record<string, string>; roomAreas: string[] } }
/** audio.json 점검: 데이터 참조 오류는 errors, 파일이 없거나 쓰이지 않는 파일은 warnings (소리는 pending 대상이 아니다) */
export function checkAudio(a: AudioData, list: { bgm: string[]; sfx: string[] }, ids: { dialogues: Set<string>; nodes: Set<string>; areas: Set<string>; endings: Set<string> }) {
  const errors: string[] = [], warnings: string[] = [];
  const tracks = new Set(Object.keys(a.bgm.tracks)), sounds = new Set(Object.keys(a.sfx.sounds));
  const used = new Set<string>();
  const useTrack = (t: string, where: string) => { used.add(t); if (!tracks.has(t)) errors.push(`audio/${where}: 목록에 없는 트랙 ${t}`); };
  for (const [k, v] of Object.entries(a.bgm.fallback)) { useTrack(k, 'fallback'); useTrack(v, 'fallback'); }
  for (const [k, v] of Object.entries(a.bgm.scene)) useTrack(v, `scene/${k}`);
  for (const [k, v] of Object.entries(a.bgm.area)) { useTrack(v, `area/${k}`); if (!ids.areas.has(k)) errors.push(`audio/area: 없는 구역 ${k}`); }
  for (const [k, v] of Object.entries(a.bgm.dialogue)) { useTrack(v, `dialogue/${k}`); if (!ids.dialogues.has(k)) errors.push(`audio/dialogue: 없는 대사 ${k}`); }
  useTrack(a.bgm.puzzle, 'puzzle');
  for (const [k, v] of Object.entries(a.bgm.ending)) { useTrack(v, `ending/${k}`); if (!ids.endings.has(k)) errors.push(`audio/ending: 없는 엔딩 ${k}`); }
  for (const [ev, s] of Object.entries(a.sfx.events)) if (!sounds.has(s)) errors.push(`audio/events/${ev}: 목록에 없는 효과음 ${s}`);
  for (const [k, ev] of Object.entries(a.sfx.nodeEvents)) { if (!(ev in a.sfx.events)) errors.push(`audio/nodeEvents/${k}: 없는 이벤트 ${ev}`); if (!ids.nodes.has(k)) errors.push(`audio/nodeEvents: 없는 대사 노드 ${k}`); }
  for (const r of a.sfx.roomAreas) if (!ids.areas.has(r)) errors.push(`audio/roomAreas: 없는 구역 ${r}`);
  const usedSfx = new Set(Object.values(a.sfx.events));
  const missBgm = [...used].filter((t) => !list.bgm.includes(t) && !Object.keys(a.bgm.fallback).includes(t));
  const variantOf = (f: string, s: string) => f === s || new RegExp(`^${s}_?\\d+$`).test(f);
  const missSfx = [...usedSfx].filter((s) => !list.sfx.some((f) => variantOf(f, s)));
  if (missBgm.length) warnings.push(`배경음악 파일 없음 ${missBgm.length}곡 (대체 규칙 없는 곡): ${missBgm.join(', ')}`);
  if (Object.keys(a.bgm.fallback).some((t) => !list.bgm.includes(t))) warnings.push(`대체 규칙이 적용되는 곡: ${Object.keys(a.bgm.fallback).filter((t) => !list.bgm.includes(t)).join(', ')}`);
  if (missSfx.length) warnings.push(`효과음 파일 없음 ${missSfx.length}개: ${missSfx.join(', ')}`);
  const unusedBgm = list.bgm.filter((t) => !used.has(t)), unusedSfx = list.sfx.filter((f) => ![...usedSfx].some((s) => variantOf(f, s)));
  if (unusedBgm.length) warnings.push(`쓰이지 않는 BGM 파일: ${unusedBgm.join(', ')}`);
  if (unusedSfx.length) warnings.push(`쓰이지 않는 효과음 파일: ${unusedSfx.join(', ')}`);
  return { errors, warnings };
}
