// 초상 적용 확인: 6명 각자의 대화 장면 스크린샷 + 9명 초상 액자 비교표 → docs/screenshots/stage8_portrait_*.png
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { launch } from './browser';

execSync('npx vite build --mode e2e', { stdio: 'ignore' });
const url = pathToFileURL(resolve('.tmp/e2e/index.html')).href;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const cw = (fn: string) => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`);
const wait = (ms: number) => page.waitForTimeout(ms);
const press = async (k: string) => { await page.keyboard.press(k); await wait(60); };
const out = (n: string) => `docs/screenshots/stage8_portrait_${n}.png`;
const jump = async (n: number) => {
  await page.goto(url); await page.waitForFunction(() => (window as any).__cw?.scene?.player);
  await page.waitForFunction(() => typeof (window as any).__cw.scene.jumpToScene === 'function');
  await page.waitForSelector('#title'); await cw('cw.quick()'); await cw(`cw.scene.jumpToScene(${n})`); await wait(900);
};
const frames: { name: string; buf: Buffer }[] = [];
const grab = async (name: string) => { await wait(1500); await page.screenshot({ path: out(name) }); frames.push({ name, buf: await page.locator('#dialogue .portrait').first().screenshot() }); await press('Escape'); };
const talk = async (id: string, room: string) => { await cw(`cw.scene.go('${room}', 50)`); await wait(900); await cw(`cw.openDialogue('${id}')`); };

await jump(1); // 기준: 박은호·한지수·백선우 초상
await cw("cw.openDialogue('eunho_intro')"); await grab('ref_eunho');
await cw("cw.openDialogue('mono_altar')"); await grab('ref_jisu');
await jump(2); await cw("cw.openDialogue('baek_lobby')"); await grab('ref_baek');
await jump(3);
await talk('choi_okja', 'room_choi'); await grab('choi_devout');
await talk('han_yujin', 'room_han'); await grab('han_fear');
await talk('chae_soyeon', 'room_jeong'); await grab('chae_worried');
await jump(4); await talk('lee_hyejeong', 'room_lee'); await grab('lee_contempt');
await jump(5); await talk('oh_miran', 'room_oh'); await grab('oh_tearful'); // oh_done 상태: 수정 진술 마지막 대사
await jump(5); await cw("cw.state.flags.push('diary_closed')"); await cw("cw.openDialogue('jeong_haneul_final')");
for (let i = 0; i < 12 && !(await page.locator('#dialogue .opt').count()); i++) { await wait(300); await press('Enter'); }
await wait(300); await press('1'); await grab('haneul_confession');
// 203호 연달아: 채소연 → 정하늘 1차 대면 (두 초상 구별)
await jump(3); await talk('chae_soyeon', 'room_jeong'); await wait(1400); await page.screenshot({ path: out('room203_chae') }); await press('Escape');
await cw("cw.openDialogue('jeong_haneul')"); await wait(1400); await press('Enter'); await wait(1200); await page.screenshot({ path: out('room203_haneul') });
await browser.close();
// 초상 액자 비교표 (같은 높이로 나란히)
const order = ['ref_jisu', 'ref_eunho', 'ref_baek', 'oh_tearful', 'lee_contempt', 'choi_devout', 'han_fear', 'chae_worried', 'haneul_confession'];
const bufs = await Promise.all(order.map((n) => sharp(frames.find((f) => f.name === n)!.buf).resize({ height: 430 }).toBuffer()));
const ms = await Promise.all(bufs.map((b) => sharp(b).metadata()));
let x = 10; const comp = bufs.map((b, i) => { const c = { input: b, left: x, top: 10 }; x += ms[i].width! + 10; return c; });
await sharp({ create: { width: x, height: 450, channels: 4, background: { r: 20, g: 14, b: 10, alpha: 1 } } }).composite(comp).png().toFile(out('sheet'));
console.log('ok');
