import { createGameState } from './state';
import type { GameState } from './types';

const KEY = 'confession_ward_save_v1';
export interface KeyValueStore { getItem(k: string): string | null; setItem(k: string, v: string): void; }

/** localStorage 를 쓸 수 없으면(차단·private) null. 호출 측은 저장 없이 계속 진행한다. */
export function defaultStore(): KeyValueStore | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function saveGame(s: GameState, store: KeyValueStore | null = defaultStore()): boolean {
  try { if (!store) return false; store.setItem(KEY, JSON.stringify(s)); return true; } catch { return false; }
}

/** 저장본이 없거나 깨졌으면 null */
export function loadGame(store: KeyValueStore | null = defaultStore()): GameState | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (typeof o !== 'object' || o === null) return null;
    const base = createGameState();
    for (const k of Object.keys(base) as (keyof GameState)[]) {
      if (k === 'reportTarget') { if (o[k] !== null && typeof o[k] !== 'string') return null; continue; }
      if (typeof o[k] !== typeof base[k] || Array.isArray(o[k]) !== Array.isArray(base[k])) return null;
    }
    return { ...base, ...o };
  } catch { return null; }
}
