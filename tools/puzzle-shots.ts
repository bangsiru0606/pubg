// 퍼즐 화면 스크린샷 (근거 칸이 보이게): P01~P05 → docs/screenshots/stage12_puzzle_<id>[_1280].png
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';
import { attachCorrectLinks, placeCorrect } from './puzzle-driver';

execSync('npx vite build --mode e2e', { stdio: 'ignore' });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors: string[] = []; page.on('pageerror', (e) => errors.push(String(e)));
const cw = (fn: string) => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`);
const wait = (ms: number) => page.waitForTimeout(ms);
const jump = async (n: number) => { await page.goto(pathToFileURL(resolve('.tmp/e2e/index.html')).href); await page.waitForFunction(() => (window as any).__cw?.scene?.player); await page.waitForFunction(() => typeof (window as any).__cw.scene.jumpToScene === 'function'); await page.waitForSelector('#title'); await cw('cw.quick()'); await cw(`cw.scene.jumpToScene(${n})`); await wait(700); };
for (const [id, scene] of [['P01_scene_rebuild', 2], ['P02_night_timeline', 3], ['P03_revision_diff', 4], ['P04_approval_chain', 4], ['P05_patient_code', 5]] as const) {
  await jump(scene); await cw(`cw.ui.prepare(${scene})`); await cw(`cw.ui.puzzle('${id}')`); await page.waitForSelector('#puzzle'); await wait(400);
  await page.screenshot({ path: `docs/screenshots/stage12_puzzle_${id.slice(0, 3)}_empty.png` });
  await placeCorrect(page, id); await attachCorrectLinks(page, id); await wait(300);
  await page.screenshot({ path: `docs/screenshots/stage12_puzzle_${id.slice(0, 3)}.png` });
  await page.setViewportSize({ width: 1280, height: 720 }); await wait(200);
  await page.screenshot({ path: `docs/screenshots/stage12_puzzle_${id.slice(0, 3)}_1280.png` });
  await page.setViewportSize({ width: 1920, height: 1080 });
}
// 근거 고르기 목록 (P03: 가진 카드가 가장 많은 시점)
await jump(4); await cw('cw.ui.prepare(4)'); await cw("cw.ui.puzzle('P03_revision_diff')"); await page.waitForSelector('#puzzle'); await placeCorrect(page, 'P03_revision_diff');
await page.locator('#puzzle [data-link="marked"]').first().click(); await wait(200); for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowDown'); await wait(200);
await page.screenshot({ path: 'docs/screenshots/stage12_puzzle_picker.png' });
await page.setViewportSize({ width: 1280, height: 720 }); await wait(200); await page.screenshot({ path: 'docs/screenshots/stage12_puzzle_picker_1280.png' });
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('퍼즐 스크린샷 저장');
