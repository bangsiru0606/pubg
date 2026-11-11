// 소리 규칙 중 순수 계산 부분 (DOM 없음, 테스트 대상): 트랙 대체, 효과음 변주, 음량·페이드 곡선.
/** 요청한 트랙이 없으면 fallback 사슬을 따라가 있는 트랙을 찾는다. 하나도 없으면 null(무음). */
export function resolveTrack(name: string | null | undefined, available: readonly string[], fallback: Record<string, string>): string | null {
  const seen = new Set<string>();
  for (let n = name ?? null; n && !seen.has(n); n = fallback[n] ?? null) { if (available.includes(n)) return n; seen.add(n); }
  return null;
}
/** 효과음 변주: `name` 자체와 `name_1`, `name2` 같은 번호 파일 */
export const sfxVariants = (name: string, available: readonly string[]) => available.filter((f) => f === name || new RegExp(`^${name}_?\\d+$`).test(f));
/** BGM 요청 쌓기: 가장 나중에 넣은 요청부터, 파일(또는 대체 트랙)이 있는 첫 요청을 쓴다. 모두 없으면 기본 트랙, 그것도 없으면 null(무음) */
export function pickBgm(base: string | null, stack: ReadonlyMap<string, string>, available: readonly string[], fallback: Record<string, string>): string | null {
  for (const t of [...[...stack.values()].reverse(), base]) { const r = resolveTrack(t, available, fallback); if (r) return r; }
  return null;
}
export interface Volumes { master: number; bgm: number; sfx: number; muted: boolean }
export const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
export const bgmGain = (v: Volumes, trackGain = 1) => (v.muted ? 0 : clamp01(v.master) * clamp01(v.bgm) * trackGain);
export const sfxGain = (v: Volumes, soundGain = 1) => (v.muted ? 0 : clamp01(v.master) * clamp01(v.sfx) * soundGain);
/** 루프 곡의 앞뒤 페이드: 재생 위치 t(초)와 길이 dur 에서 0~1 */
export const loopEnvelope = (t: number, dur: number, fade: number) => (dur > 0 && Number.isFinite(dur) ? clamp01(Math.min(t / fade, (dur - t) / fade)) : 1);
/** 반복 곡의 이음새: 끝이 `x`초 남은 시점부터 끝(out)과 처음(in)을 같은 힘(등파워)으로 교차한다. remain = 남은 초 */
export const loopFade = (remain: number, x: number): [number, number] => { const p = clamp01(1 - remain / x); return [Math.cos((p * Math.PI) / 2), Math.sin((p * Math.PI) / 2)]; };
/** 같은 소리의 동시 재생 수 제한 */
export const canPlay = (active: number, max = 3) => active < max;
