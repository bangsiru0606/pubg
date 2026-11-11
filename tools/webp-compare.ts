// PNG 원본 vs WebP 화질 비교 캡처 (1920×1080): npx tsx tools/webp-compare.ts png|webp → docs/screenshots/stage8_img_<png|webp>_*.png
// png 모드는 원본 PNG 바이트를 .webp 이름으로 잠시 덮어 쓴 빌드를 만든다(브라우저는 내용으로 판별). 끝나면 npm run assets 로 되돌린다.
import { execSync } from 'node:child_process';
import { copyFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';

const mode = process.argv[2] === 'png' ? 'png' : 'webp';
if (mode === 'png') {
  for (const [dir, names] of [['art/source/Resources/Art/Office', ['desk', 'item_letter', 'hat', 'hat_detail', 'calendar', 'calendar_detail']], ['art/source/generated/portraits', readdirSync('art/source/generated/portraits').map((f) => f.slice(0, -4))]] as const)
    for (const n of names) copyFileSync(`${dir}/${n}.png`, `public/assets/illust/${n}.webp`);
}
execSync('npx vite build --mode e2e', { stdio: 'ignore' });
const url = pathToFileURL(resolve('.tmp/e2e/index.html')).href;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const cw = (fn: string) => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`);
const wait = (ms: number) => page.waitForTimeout(ms);
const out = (n: string) => `docs/screenshots/stage8_img_${mode}_${n}.png`;
const fresh = async (n: number) => { await page.goto(url); await page.waitForFunction(() => (window as any).__cw?.scene?.player); await page.waitForFunction(() => typeof (window as any).__cw.scene.jumpToScene === 'function'); await page.waitForSelector('#title'); await cw('cw.quick()'); await cw(`cw.scene.jumpToScene(${n})`); await wait(900); };
await fresh(5); await cw("cw.scene.go('room_oh', 50)"); await wait(900); await cw("cw.openDialogue('oh_miran')"); await wait(1800); await page.screenshot({ path: out('portrait') });
await fresh(2); await cw("cw.scene.go('office', 67.5)"); await wait(900); await cw('cw.scene.teleportX(67.5)'); await wait(300); await page.keyboard.press('Enter'); await page.waitForSelector('#closeup'); await wait(500);
await page.screenshot({ path: out('desk') });
await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter'); await wait(500); await page.screenshot({ path: out('hat_detail') });
await fresh(2); await cw("cw.state.evidenceIds.push('E01_last_letter')"); await page.keyboard.press('Tab'); await page.waitForSelector('#notebook'); await page.keyboard.press('Enter'); await page.waitForSelector('#viewer'); await wait(500);
await page.screenshot({ path: out('letter') });
await browser.close(); console.log('ok', mode);
