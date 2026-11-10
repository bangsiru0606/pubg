import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAYER_NAME, characterName, createGameState, fmtName, getPlayerName, loadGame, normalizeName, saveGame, setPlayerName, type KeyValueStore,
} from '../src/core';
import { hitsArt, maskOf } from '../src/explore/mask';
import { INTERACT_RANGE, areas } from '../src/explore/interaction';

describe('이름 입력 (0-1)', () => {
  it('앞뒤 공백 제거, 비면 기본 이름, 8자 제한', () => {
    expect(normalizeName('  서윤  ')).toBe('서윤');
    expect(normalizeName('')).toBe(DEFAULT_PLAYER_NAME);
    expect(normalizeName('   ')).toBe(DEFAULT_PLAYER_NAME);
    expect(normalizeName('가나다라마바사아자차')).toBe('가나다라마바사아');
    expect(DEFAULT_PLAYER_NAME).toBe('한지수');
  });
  it('{player} 토큰과 han_jisu 표시 이름이 입력한 이름을 따른다, 기본값으로 되돌릴 수 있다', () => {
    setPlayerName('서윤');
    expect(fmtName('안녕 {player}, {player}!')).toBe('안녕 서윤, 서윤!');
    expect(characterName('han_jisu')).toBe('서윤');
    expect(characterName('park_eunho')).toBe('박은호');
    setPlayerName(DEFAULT_PLAYER_NAME);
    expect(characterName('han_jisu')).toBe('한지수');
    expect(getPlayerName()).toBe('한지수');
  });
  it('이름은 GameState 에 저장되고 이어하기에서 유지된다', () => {
    const mem: Record<string, string> = {}; const store: KeyValueStore = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
    const s = createGameState(); s.playerName = '서윤'; saveGame(s, store);
    expect(loadGame(store)!.playerName).toBe('서윤');
  });
});

describe('근접 조사 클릭 영역 (0-3)', () => {
  it('실제 그림 위만 반응하고 투명 여백은 반응하지 않는다', () => {
    for (const icon of ['hat', 'calendar']) {
      const m = maskOf(icon);
      expect(m.bits.length).toBeGreaterThan(5);
      expect(hitsArt(icon, 0.5, 0.5)).toBe(true);
      expect(hitsArt(icon, -0.01, 0.5)).toBe(false);
      expect(hitsArt(icon, 1.0, 0.5)).toBe(false);
    }
    expect(hitsArt('hat', 0.0, 0.0)).toBe(false); // 모자 bbox 의 모서리는 투명
  });
});

describe('구역 전환 (0-4)', () => {
  it('도착 위치가 도착 구역의 어떤 전환 지점의 상호작용 범위 안에도 없다', () => {
    for (const [id, a] of Object.entries(areas)) for (const t of a.interactables) {
      if (t.type !== 'transition') continue;
      for (const u of areas[t.to].interactables) if (u.type === 'transition') expect(Math.abs(t.spawnX - u.x), `${id}/${t.id} → ${t.to}/${u.id}`).toBeGreaterThan(INTERACT_RANGE);
    }
  });
  it('자동 전환(auto)은 지도에 명시한 것만 — 지금은 없다', () => {
    for (const a of Object.values(areas)) for (const t of a.interactables) if (t.type === 'transition') expect(t.auto).toBeUndefined();
  });
});
