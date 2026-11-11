import { describe, expect, it } from 'vitest';
import spec from '../art/asset-spec.json';
import { draftFromManifest, type ManifestEntry } from '../tools/import-generated';

const M: ManifestEntry[] = [
  { file: 'characters/baek/idle_0.png', kind: 'sprite', facing: 'right', chromaKey: true },
  { file: 'characters/baek/idle_1.png', kind: 'sprite', facing: 'right', chromaKey: true },
  { file: 'backgrounds/lobby_wall.png', kind: 'wall', facing: null, chromaKey: false },
  { file: 'backgrounds/lobby_floor.png', kind: 'floor', facing: null, chromaKey: false },
  { file: 'props/cleaning_cart.png', kind: 'prop', facing: null, chromaKey: true },
  { file: 'props/mystery.png', kind: 'prop', facing: null, chromaKey: true },
  { file: 'portraits/baek_neutral.png', kind: 'portrait', facing: null, chromaKey: false },
];
const gen = (x: any) => !x.draft; // 이미 가져온 생성 항목을 뺀 기준 spec
const base = { sequences: (spec.sequences as any[]).filter(gen), sprites: (spec.sprites as any[]).filter(gen), illust: (spec.illust as string[]).filter((i) => !i.startsWith('generated/')) };

describe('생성 에셋 가져오기 (manifest → asset-spec 초안)', () => {
  it('kind·facing·chromaKey 를 옮기고 높이는 규격으로 채운다', () => {
    const d = draftFromManifest(M, base);
    expect(d.sequences).toEqual([{ id: 'baek', src: 'generated/characters/baek', frames: ['idle_0', 'idle_1'], canvasHeight: 90, colours: 64, facing: 'right', chromaKey: true, draft: true }]);
    // idle_1 을 쓰지 않기로 하면(ignoreGenerated) idle_0 한 장 + breathe
    const b = draftFromManifest(M, { ...base, ignoreGenerated: ['characters/baek/idle_1.png'] });
    expect(b.sequences[0]).toMatchObject({ frames: ['idle_0'], breathe: true });
    expect(d.sprites.find((s) => s.id === 'lobby_wall')).toMatchObject({ height: 270, chromaKey: false });
    expect(d.sprites.find((s) => s.id === 'lobby_floor')).toMatchObject({ height: 112 });
    expect(d.sprites.find((s) => s.id === 'cleaning_cart')).toMatchObject({ height: 54, chromaKey: true });
    expect(d.sprites.find((s) => s.id === 'mystery')).toMatchObject({ height: 90, note: expect.any(String) }); // 규격에 없으면 확인 표시
    expect(d.illust).toEqual(['generated/portraits/*.png']);
  });
  it('이미 있는 항목은 덮어쓰지 않는다', () => {
    const have = { ...base, sequences: [...base.sequences, { id: 'baek' }], sprites: [...base.sprites, { id: 'lobby_wall' }] };
    const d = draftFromManifest(M, have);
    expect(d.sequences).toEqual([]);
    expect(d.sprites.some((s) => s.id === 'lobby_wall')).toBe(false);
  });
  it('facing 이 없는 스프라이트는 오류 (새 캐릭터는 facing 필수)', () => {
    expect(() => draftFromManifest([{ file: 'characters/x/idle_0.png', kind: 'sprite', facing: null }], base)).toThrow(/facing/);
  });
});
