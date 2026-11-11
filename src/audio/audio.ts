// 오디오 관리자: BGM 1채널(교차 페이드 1.5초, 루프 곡은 앞뒤 페이드) + 효과음 다채널(같은 소리 동시 3개까지).
// HTMLAudioElement 로 ./assets/audio/... 를 재생한다 (fetch·decodeAudioData 금지 — file:// 호환). 파일이 없으면 요소를 만들지 않아 오류 없이 무음이다.
// 어떤 장면에서 무엇을 틀지는 src/data/audio.json, 있는 파일 목록은 정규화가 만드는 src/data/audio-list.json.
import data from '../data/audio.json';
import list from '../data/audio-list.json';
import { bgmGain, canPlay, clamp01, loopEnvelope, pickBgm, sfxGain, sfxVariants, type Volumes } from './resolve';

const FADE_S = 1.5, TICK_MS = 50, KEY = 'cw_audio';
type TrackCfg = { loop?: boolean; gain?: number };
const tracks = data.bgm.tracks as Record<string, TrackCfg>;
const sounds = data.sfx.sounds as Record<string, { volume?: number }>;
const events = data.sfx.events as Record<string, string>;
const available = { bgm: list.bgm as string[], sfx: list.sfx as string[] };
const sfxExt = (list as { ext?: Record<string, string> }).ext ?? {}; // 1초 이상 효과음은 ogg 로 변환되어 있다

let vol: Volumes = { master: 0.8, bgm: 0.7, sfx: 0.8, muted: false };
try { const o = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (o) vol = { master: clamp01(o.master ?? vol.master), bgm: clamp01(o.bgm ?? vol.bgm), sfx: clamp01(o.sfx ?? vol.sfx), muted: !!o.muted }; } catch { /* 저장소 사용 불가: 기본값 */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(vol)); } catch { /* 무시 */ } };

let unlocked = false;
const unlockListeners = new Set<() => void>();
/** 첫 키 입력·클릭이 있었는가 (그 전에는 소리를 내지 않는다) */
export const isUnlocked = () => unlocked;
export const onUnlock = (f: () => void) => { unlockListeners.add(f); };
function unlock() {
  if (unlocked) return;
  unlocked = true; unlockListeners.forEach((f) => f()); apply();
}
window.addEventListener('keydown', unlock, { capture: true });
window.addEventListener('pointerdown', unlock, { capture: true });

// ---------- BGM ----------
interface Chan { name: string; el: HTMLAudioElement; level: number; target: number; cfg: TrackCfg } // level: 교차 페이드 진행(0~1)
let chans: Chan[] = [];
let base: string | null = null;
const stack = new Map<string, string>();
let timer = 0;

const mk = (kind: 'bgm' | 'sfx', name: string) => {
  try { const a = new Audio(`assets/audio/${kind}/${name}.${kind === 'bgm' ? 'mp3' : sfxExt[name] ?? 'wav'}`); a.preload = 'auto'; return a; } catch { return null; }
};
const play = (a: HTMLAudioElement) => { try { void a.play()?.catch(() => { /* 자동 재생 차단 등: 무음 */ }); } catch { /* 무시 */ } };

function apply() {
  if (!unlocked) return;
  const want = pickBgm(base, stack, available.bgm, data.bgm.fallback);
  const cur = chans.find((c) => c.target === 1);
  if (cur?.name !== want) {
    for (const c of chans) c.target = 0;
    if (want) {
      const el = mk('bgm', want);
      if (el) { const cfg = tracks[want] ?? {}; el.loop = cfg.loop !== false; el.volume = 0; chans.push({ name: want, el, level: 0, target: 1, cfg }); play(el); }
    }
  }
  if (!timer && chans.length) timer = window.setInterval(tick, TICK_MS);
}

function tick() {
  const step = TICK_MS / 1000 / FADE_S;
  for (const c of chans) {
    c.level = c.target > c.level ? Math.min(c.target, c.level + step) : Math.max(c.target, c.level - step);
    const env = loopEnvelope(c.el.currentTime, c.el.duration, FADE_S); // 앞뒤 페이드 (길이를 모르면 1)
    try { c.el.volume = clamp01(c.level * env * bgmGain(vol, c.cfg.gain)); } catch { /* 무시 */ }
  }
  for (const c of chans.filter((x) => x.level <= 0 && x.target === 0)) { try { c.el.pause(); } catch { /* 무시 */ } }
  chans = chans.filter((c) => !(c.level <= 0 && c.target === 0));
  if (!chans.length) { clearInterval(timer); timer = 0; }
}

/** 기본 BGM (구역·타이틀). 이름은 audio.json 의 트랙 이름 */
export function bgmBase(track: string | null) { base = track; apply(); }
/** 대화·퍼즐·보고서·엔딩 같은 덮어쓰기 요청. key 별로 하나, 가장 나중 것이 이긴다 */
export function bgmPush(key: string, track: string | undefined) { if (!track) return; stack.delete(key); stack.set(key, track); apply(); }
export function bgmPop(key: string) { if (stack.delete(key)) apply(); }
export const areaTrack = (areaId: string) => (data.bgm.area as Record<string, string>)[areaId] ?? null;
export const sceneTrack = (name: 'title' | 'report') => data.bgm.scene[name];
export const dialogueTrack = (id: string) => (data.bgm.dialogue as Record<string, string>)[id];
export const puzzleTrack = () => data.bgm.puzzle;
export const endingTrack = (id: string) => (data.bgm.ending as Record<string, string>)[id];

// ---------- 효과음 ----------
const active = new Map<string, HTMLAudioElement[]>();
const turn = new Map<string, number>();
/** 게임 이벤트 이름(onEvidenceGet 등) → 효과음. 모르는 이벤트·없는 파일·잠금 전은 조용히 무시 */
export function sfx(event: string) {
  const name = events[event];
  if (!name || !unlocked || vol.muted) return;
  const vs = sfxVariants(name, available.sfx);
  if (!vs.length) return;
  const n = (turn.get(name) ?? 0) % vs.length; turn.set(name, n + 1); // 변주는 번갈아
  const list2 = active.get(name) ?? []; active.set(name, list2);
  if (!canPlay(list2.length)) return;
  const el = mk('sfx', vs[n]);
  if (!el) return;
  el.volume = clamp01(sfxGain(vol, sounds[name]?.volume));
  list2.push(el);
  const done = () => { const i = list2.indexOf(el); if (i >= 0) list2.splice(i, 1); };
  el.addEventListener('ended', done); el.addEventListener('error', done);
  play(el);
}
/** 대사 노드 진입 효과: audio.json nodeEvents ("대사:노드" → 이벤트) */
export function nodeSfx(dialogueId: string, nodeId: string) { const e = (data.sfx.nodeEvents as Record<string, string>)[`${dialogueId}:${nodeId}`]; if (e) sfx(e); }
/** 문·계단 전환 효과 */
export function transitionSfx(kind: 'door' | 'stairs', fromArea: string, toArea: string) {
  if (kind === 'stairs') { sfx('onStairs'); return; }
  const rooms = data.sfx.roomAreas as string[];
  sfx(rooms.includes(toArea) ? 'onDoorEnter' : rooms.includes(fromArea) ? 'onDoorExit' : 'onDoorEnter');
}

// ---------- 설정 ----------
export const getVolumes = (): Volumes => ({ ...vol });
export function setVolume(k: 'master' | 'bgm' | 'sfx', v: number) { vol = { ...vol, [k]: clamp01(Math.round(v * 10) / 10) }; save(); refresh(); }
export function toggleMute() { vol = { ...vol, muted: !vol.muted }; save(); refresh(); return vol.muted; }
function refresh() { if (chans.length) tick(); }

/** 시험용: 현재 상태 (e2e 훅에서만 부른다) */
export const debugState = () => ({ unlocked, base, stack: [...stack.entries()], bgm: chans.map((c) => ({ name: c.name, target: c.target, level: +c.level.toFixed(2), paused: c.el.paused })), sfxActive: Object.fromEntries([...active].map(([k, v]) => [k, v.length])), vol });
