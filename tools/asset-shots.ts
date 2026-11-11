// 생성 에셋 적용 확인 스크린샷 (×4): npx tsx tools/asset-shots.ts → docs/screenshots/stage8_asset_*.png
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';

execSync('npx vite build --mode e2e', { stdio: 'ignore' });
const url = pathToFileURL(resolve('.tmp/e2e/index.html')).href;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const cw = (fn: string) => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`);
const wait = (ms: number) => page.waitForTimeout(ms);
const out = (n: string) => `docs/screenshots/stage8_asset_${n}.png`;
const jump = async (n: number) => {
  await page.goto(url); await page.waitForFunction(() => (window as any).__cw?.scene?.player);
  await page.waitForFunction(() => typeof (window as any).__cw.scene.jumpToScene === 'function');
  await page.waitForSelector('#title'); await cw('cw.quick()'); await cw(`cw.scene.jumpToScene(${n})`); await wait(900);
};
const go = async (area: string, x: number, px: number) => { await cw(`cw.scene.go('${area}', ${px})`); await wait(900); await cw(`cw.scene.teleportX(${x})`); await wait(300); };

await jump(2);
await cw("cw.state.flags.push('trigger_fired:floor1:baek')"); // 자동 대화 없이 걷는 모습을 찍는다
await cw('cw.scene.teleportX(100)'); await wait(400); await page.screenshot({ path: out('floor1_beside_baek') });
await page.keyboard.down('ArrowRight'); await wait(350); await page.screenshot({ path: out('floor1_walking') }); await page.keyboard.up('ArrowRight');
await cw('cw.scene.teleportX(51)'); await wait(400); await page.screenshot({ path: out('floor1_seam') });
await cw('cw.scene.teleportX(430)'); await wait(400); await page.screenshot({ path: out('floor1_seam2') });
await cw('cw.scene.teleportX(110)'); await wait(300); await cw("cw.openDialogue('baek_lobby')"); await wait(1600); await page.screenshot({ path: out('baek_dialogue') });
await page.keyboard.press('Escape');
await jump(3);
await go('room_choi', 120, 50); await page.screenshot({ path: out('room_choi') });
await go('floor2', 100, 50);
await go('room_han', 120, 50); await page.screenshot({ path: out('room_han') });
await go('floor2', 100, 50);
await go('room_jeong', 300, 50); await page.screenshot({ path: out('room_jeong') });
await jump(4);
await go('room_oh', 100, 50); await page.screenshot({ path: out('room_oh') });
await go('floor3', 100, 50);
await go('room_lee', 100, 50); await page.screenshot({ path: out('room_lee') });
await go('floor3', 100, 50);
await go('room_baek', 100, 50); await cw("cw.openDialogue('baek_office')"); await wait(1500); await page.screenshot({ path: out('room_baek_dialogue') });
await jump(5);
await cw("cw.state.flags.push('diary_closed')"); await cw('cw.scene.refresh()'); await wait(300); await cw('cw.scene.teleportX(300)'); await wait(400); await page.screenshot({ path: out('b1_haneul') });
await browser.close();
console.log('ok');
