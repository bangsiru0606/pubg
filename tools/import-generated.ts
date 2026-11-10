// art/source/generated/manifest.json(Codex $imagegen 이 만든 목록)을 읽어 art/asset-spec.json 항목 초안을 만든다.
//   npx tsx tools/import-generated.ts            → art/asset-spec.draft.json 에 새 항목만 쓴다 (기존 spec 은 건드리지 않는다)
//   npx tsx tools/import-generated.ts --apply    → 초안을 art/asset-spec.json 에 합친다 (이미 있는 항목은 덮어쓰지 않는다)
// manifest 의 kind·facing·chromaKey 를 옮기고, 높이는 이전계획 2장·3.3.1 규격으로 채운다. art/source/generated 에는 쓰지 않는다.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

export interface ManifestEntry { file: string; size?: number[]; kind: string; facing?: 'left' | 'right' | null; chromaKey?: boolean }
export interface Spec { sequences: any[]; sprites: any[]; illust: string[]; [k: string]: unknown }

/** 이전계획 3.3.1: 소품 높이(px). 표에 없으면 90 으로 두고 draft 표시를 남긴다. */
export const PROP_HEIGHT: Record<string, number> = { door: 117, stairs: 90, cleaning_cart: 54, bed: 40, desk: 59, chair: 40, altar: 50 };
export const WALL_HEIGHT = 270; // 6유닛
export const FLOOR_HEIGHT = 112; // 바닥선 y=158 아래

export function draftFromManifest(manifest: ManifestEntry[], spec: Pick<Spec, 'sequences' | 'sprites' | 'illust'>) {
  const draft = { sequences: [] as any[], sprites: [] as any[], illust: [] as string[] };
  const haveSeq = new Set(spec.sequences.map((q) => q.id)), haveSprite = new Set(spec.sprites.map((q) => q.id)), haveIllust = new Set(spec.illust);
  // 스프라이트 시퀀스: characters/<id>/<frame>.png 를 인물별로 묶는다
  const chars = new Map<string, ManifestEntry[]>();
  for (const m of manifest.filter((e) => e.kind === 'sprite')) { const id = basename(dirname(m.file)); chars.set(id, [...(chars.get(id) ?? []), m]); }
  for (const [id, list] of chars) {
    if (haveSeq.has(id)) continue;
    const facing = list[0].facing;
    if (facing !== 'left' && facing !== 'right') throw new Error(`manifest ${id}: facing 누락 (left|right 필수)`);
    draft.sequences.push({ id, src: `generated/${dirname(list[0].file)}`, frames: list.map((e) => basename(e.file, '.png')).sort(), canvasHeight: 90, colours: 64, facing, chromaKey: !!list[0].chromaKey, draft: true });
  }
  for (const m of manifest.filter((e) => ['wall', 'floor', 'prop'].includes(e.kind))) {
    const id = basename(m.file, '.png');
    if (haveSprite.has(id)) continue;
    const known = m.kind === 'prop' ? PROP_HEIGHT[id] : undefined;
    draft.sprites.push({ id, src: `generated/${m.file}`, height: m.kind === 'wall' ? WALL_HEIGHT : m.kind === 'floor' ? FLOOR_HEIGHT : known ?? 90, chromaKey: !!m.chromaKey, draft: true, ...(m.kind === 'prop' && known === undefined ? { note: '높이를 이전계획 3.3.1 에서 확인' } : {}) });
  }
  for (const dir of new Set(manifest.filter((e) => ['portrait', 'illust'].includes(e.kind)).map((e) => `generated/${dirname(e.file)}/*.png`)))
    if (!haveIllust.has(dir)) draft.illust.push(dir);
  return draft;
}

if (process.argv[1]?.endsWith('import-generated.ts')) {
  const MANIFEST = 'art/source/generated/manifest.json';
  if (!existsSync(MANIFEST)) { console.log('manifest 가 아직 없다 — 생성 에셋이 준비되면 다시 실행한다.'); process.exit(0); }
  const spec: Spec = JSON.parse(readFileSync('art/asset-spec.json', 'utf8'));
  const draft = draftFromManifest(JSON.parse(readFileSync(MANIFEST, 'utf8')), spec);
  const n = draft.sequences.length + draft.sprites.length + draft.illust.length;
  if (process.argv.includes('--apply')) {
    spec.sequences.push(...draft.sequences); spec.sprites.push(...draft.sprites); spec.illust.push(...draft.illust);
    writeFileSync('art/asset-spec.json', JSON.stringify(spec, null, 2) + '\n');
    console.log(`asset-spec.json 에 ${n}개 항목을 추가했다.`);
  } else {
    writeFileSync('art/asset-spec.draft.json', JSON.stringify(draft, null, 2) + '\n');
    console.log(`초안 ${n}개 → art/asset-spec.draft.json (적용: --apply)`);
  }
}
