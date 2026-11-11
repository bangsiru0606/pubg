import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import spec from '../art/asset-spec.json';
import { breatheFrame, waistRow } from '../tools/breathe';

const rows = async (png: Buffer) => { const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };
const row = (d: { data: Buffer; w: number }, y: number) => d.data.subarray(y * d.w * 4, (y + 1) * d.w * 4);

describe('숨쉬기 프레임 (idle_0 → idle_1)', () => {
  it('발(허리 아래) 행은 같고, 윗부분은 1px 아래로만 내려간다', async () => {
    const W = 20, H = 90, buf = Buffer.alloc(W * H * 4);
    for (let y = 2; y < H; y++) for (let x = 4; x < 16; x++) buf.set([(y * 7) % 256, (y * 13) % 256, 80, 255], (y * W + x) * 4); // 행마다 다른 색
    const png = await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
    const a = await rows(png), b = await rows(await breatheFrame(png)), waist = waistRow(H);
    for (let y = waist + 1; y < H; y++) expect(Buffer.compare(row(a, y), row(b, y)), `발 행 ${y}`).toBe(0);
    for (let y = 0; y < waist; y++) expect(Buffer.compare(row(a, y), row(b, y + 1)), `윗부분 ${y}`).toBe(0); // 정확히 1px 이동
    expect(row(b, 0).every((v) => v === 0)).toBe(true);
  });
  it('asset-spec: 생성 캐릭터 7명은 breathe, 캔버스 높이 90, facing right', () => {
    const ids = ['baek', 'oh', 'lee', 'choi', 'han', 'chae', 'haneul'];
    for (const id of ids) {
      const q = (spec.sequences as any[]).find((s) => s.id === id);
      expect(q, id).toMatchObject({ breathe: true, canvasHeight: 90, facing: 'right', chromaKey: true });
    }
    expect((spec as any).ignoreGenerated).toEqual(expect.arrayContaining(['characters/baek/idle_1.png', 'backgrounds/lobby_floor.png']));
  });
});
