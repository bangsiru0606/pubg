// art/source/audio → public/assets/audio 정규화 (npm run assets 가 부른다).
//   bgm/*.mp3 → audio/bgm/ , sfx/*.wav → audio/sfx/ 로 복사 (재인코딩 도구 ffmpeg 가 있으면 BGM 을 MP3 128kbps 로 다시 만든다. 없으면 원본 복사)
//   bgm/CREDITS.md → src/data/bgm-credits.json (타이틀 "정보"에 표시), 있는 파일 목록 → src/data/audio-list.json
//   소리 전체가 12MB 를 넘으면 실패한다.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export const AUDIO_BUDGET = 12 * 1024 * 1024;

/** CREDITS.md → 화면에 보일 줄들 (제목·표 서식·강조 기호를 걷어 낸다) */
export function parseCredits(md: string): string[] {
  return md.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^[-|:\s]+$/.test(l))
    .map((l) => l.replace(/^#+\s*/, '').replace(/^[-*]\s+/, '').replace(/\*\*|`/g, '').replace(/^\||\|$/g, '').replace(/\s*\|\s*/g, ' · ').trim()).filter(Boolean);
}

export function normalizeAudio(src = 'art/source/audio', out = 'public/assets/audio') {
  const list = { bgm: [] as string[], sfx: [] as string[] };
  let total = 0;
  const ffmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
  for (const [kind, ext] of [['bgm', 'mp3'], ['sfx', 'wav']] as const) {
    const dir = join(src, kind);
    if (!existsSync(dir)) continue;
    mkdirSync(join(out, kind), { recursive: true });
    for (const f of readdirSync(dir).filter((x) => x.toLowerCase().endsWith(`.${ext}`)).sort()) {
      const name = f.slice(0, -ext.length - 1), to = join(out, kind, `${name}.${ext}`);
      if (kind === 'bgm' && ffmpeg && spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(dir, f), '-b:a', '128k', '-ac', '2', to]).status === 0) { /* 재인코딩 성공 */ }
      else copyFileSync(join(dir, f), to);
      total += statSync(to).size; list[kind].push(name);
    }
  }
  if (total > AUDIO_BUDGET) throw new Error(`소리 용량 ${(total / 1048576).toFixed(1)}MB 가 예산 12MB 를 넘는다`);
  const credits = join(src, 'bgm', 'CREDITS.md');
  writeFileSync('src/data/bgm-credits.json', JSON.stringify(existsSync(credits) ? parseCredits(readFileSync(credits, 'utf8')) : []));
  writeFileSync('src/data/audio-list.json', JSON.stringify(list));
  return { list, total, ffmpeg };
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
