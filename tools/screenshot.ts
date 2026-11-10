// release 빌드를 열어 ×4(1920×1080)로 캡처한다.
//  기본: 사무실 (stage1_office.png). `npx tsx tools/screenshot.ts fix`: 걷는 방향·대화 중 모습 (stage4_fix_*.png)
import AdmZip from 'adm-zip';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';

const dir = mkdtempSync(join(tmpdir(), 'cw-'));
new AdmZip('release/ConfessionWard_v1.0_web.zip').extractAllTo(dir, true);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(pathToFileURL(join(dir, 'ConfessionWard_v1.0_web', 'index.html')).href);
await page.waitForFunction(() => (window as any).__game?.scene.getScene('Explore')?.player);
const hold = async (key: string, ms: number) => { await page.keyboard.down(key); await page.waitForTimeout(ms); };

if (process.argv[2] === 'fix') {
  const out = (n: string) => `docs/screenshots/stage4_fix_${n}.png`;
  await hold('ArrowRight', 700);
  await page.screenshot({ path: out('walk_right') });   // 오른쪽으로 걷는 중
  await page.keyboard.up('ArrowRight');
  await hold('ArrowLeft', 500);
  await page.screenshot({ path: out('walk_left') });    // 왼쪽으로 걷는 중
  await page.keyboard.up('ArrowLeft');
  await hold('ArrowRight', 2200); await page.keyboard.up('ArrowRight'); // 박은호 앞까지
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForSelector('#dialogue');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out('talk') });         // 대화 중
} else {
  await hold('ArrowRight', 1200); // 책상~창문~증거보드가 보이는 위치로
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(300);
  await page.screenshot({ path: process.argv[2] ?? 'docs/screenshots/stage1_office.png' });
}
await browser.close();
