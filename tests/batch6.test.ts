import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import spec from '../art/asset-spec.json';
import evidence from '../src/data/evidence.json';
import endings from '../src/data/endings.json';
import map from '../src/data/map.json';
import illustList from '../src/data/illust-list.json';

describe('배치 6 적용', () => {
  it('pending 은 비었다', () => {
    expect(spec.pending).toEqual([]); // 배치 7 일부(백선우 걷기)가 들어와 비었다
  });
  it('증거 근접 그림 5장이 해당 단서의 상세 보기에 연결된다', () => {
    const want: Record<string, string> = { E02_altar_blood: 'ev_altar_blood_v2', E04_wristband_fragment: 'ev_wristband', E06_torn_sleeve: 'ev_torn_sleeve', E09_sedative_gap: 'ev_syringe_bag', E14_belongings_diary: 'ev_belongings' };
    for (const [id, img] of Object.entries(want)) {
      expect((evidence as { id: string; illust?: string }[]).find((e) => e.id === id)!.illust).toBe(img);
      expect(illustList).toContain(img);
    }
  });
  it('엔딩 카드 4장·타이틀 그림이 있다 (엔딩 id 와 같은 이름)', () => {
    for (const e of (endings as unknown as { endings: { id: string }[] }).endings) expect(illustList, e.id).toContain(e.id);
    expect(illustList).toContain('title_key');
  });
  it('열림/닫힘 철창문은 같은 크기·같은 자리(바깥 문틀 상자가 같다)', async () => {
    const a = await sharp('public/assets/stairs_basement.png').metadata(), b = await sharp('public/assets/stairs_basement_closed.png').metadata();
    expect([b.width, b.height]).toEqual([a.width, a.height]);
    const box = async (f: string) => { const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); let x0 = info.width, x1 = -1, y0 = info.height, y1 = -1; for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; };
    expect(await box('public/assets/stairs_basement_closed.png')).toEqual(await box('public/assets/stairs_basement.png'));
    expect((spec.sprites as { id: string; fitTo?: string }[]).find((s) => s.id === 'stairs_basement_closed')!.fitTo).toBe('stairs_basement');
  });
  it('평면도는 원장실 P01 조사 지점의 벽걸이 그림이고 작은 벽걸이 크기(order_emblem 32 근처)다', () => {
    const plan = map.areas.room_director.interactables.find((i) => i.id === 'plan') as { art?: string; artBottom?: number };
    expect(plan.art).toBe('floor_plan_board'); expect(existsSync('public/assets/floor_plan_board.png')).toBe(true);
    const h = (spec.sprites as { id: string; height: number }[]).find((s) => s.id === 'floor_plan_board')!.height;
    expect(h).toBeLessThanOrEqual(44); expect(h).toBeGreaterThanOrEqual(32);
    expect(JSON.parse(readFileSync('src/data/illust-list.json', 'utf8'))).toBeTruthy();
  });
});
