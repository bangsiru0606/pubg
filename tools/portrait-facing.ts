// 대화 초상 방향 확인: 인물마다 [원본 | 대화창에 보이는 모습]을 한 장으로 → docs/screenshots/portrait_facing.png
//   원본이 왼쪽을 보면(portraitFacing: left) 대화창에서 좌우 반전해 화면 안쪽(오른쪽)을 보게 한다. 원본 그림은 고치지 않는다.
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const chars = (JSON.parse(readFileSync('src/data/characters.json', 'utf8')).characters as { id: string; name: string; portrait: string | null; portraitFacing?: string }[]).filter((c) => c.portrait);
const H = 230, W = 190, comp: { input: Buffer; left: number; top: number }[] = [], labels: string[] = [];
for (const [i, c] of chars.entries()) {
  const src = await sharp(`public/assets/illust/${c.portrait}_neutral.webp`).resize({ height: H }).png().toBuffer();
  const shown = c.portraitFacing === 'left' ? await sharp(src).flop().toBuffer() : src;
  const ox = (i % 3) * (W * 2 + 30), oy = Math.floor(i / 3) * (H + 28);
  comp.push({ input: await sharp(src).resize({ width: W, height: H, fit: 'contain', background: '#222' }).toBuffer(), left: ox, top: oy + 24 }, { input: await sharp(shown).resize({ width: W, height: H, fit: 'contain', background: '#222' }).toBuffer(), left: ox + W + 4, top: oy + 24 });
  labels.push(`<text x="${ox + 2}" y="${oy + 16}" font-size="13" fill="#eee" font-family="sans-serif">${c.portrait} (${c.portraitFacing}) → ${c.portraitFacing === 'left' ? '뒤집음 ▶' : '그대로 ▶'}</text>`);
}
const SW = 3 * (W * 2 + 30), SH = Math.ceil(chars.length / 3) * (H + 28);
await sharp({ create: { width: SW, height: SH, channels: 3, background: '#181818' } }).composite([...comp, { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${SH}">${labels.join('')}</svg>`), left: 0, top: 0 }]).png().toFile('docs/screenshots/portrait_facing.png');
console.log(`초상 ${chars.length}명 → docs/screenshots/portrait_facing.png`);
