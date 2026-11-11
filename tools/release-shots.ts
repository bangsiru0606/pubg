// 제출용 스크린샷 (1920×1080): main.png(타이틀) · play.png(1층 탐색) · dialogue.png · notebook.png · puzzle.png
//   npm run release:shots                 → screenshots/ 에 쓴다 (최종 촬영은 배치 6 이후에 한다)
//   OUT=.tmp/release-shots npm run release:shots   → 실행만 확인할 때
// 시험 빌드(vite build --mode e2e)의 화면 훅으로 장면을 만든다. 제출 화면과 그림·UI 는 같고, 시험용 대사만 빠져 있다.
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';

const OUT = process.env.OUT ?? 'screenshots';
mkdirSync(OUT, { recursive: true });
execSync('npx vite build --mode e2e', { stdio: 'ignore' });
const url = pathToFileURL(resolve('.tmp/e2e/index.html')).href;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
const cw = (fn: string) => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`);
const wait = (ms: number) => page.waitForTimeout(ms);
const shot = (name: string) => page.screenshot({ path: `${OUT}/${name}.png` });
const closeAll = async () => { for (let i = 0; i < 4; i++) await page.keyboard.press('Escape'); await wait(100); };
const fresh = async () => { await page.goto(url); await page.waitForFunction(() => (window as any).__cw?.scene?.player); await page.waitForFunction(() => typeof (window as any).__cw.scene.jumpToScene === 'function'); await page.waitForSelector('#title'); };
const jump = async (n: number) => { await fresh(); await cw('cw.quick()'); await cw(`cw.scene.jumpToScene(${n})`); await wait(900); };

await fresh(); await wait(300);
await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp'); await wait(300); // 소리 잠금이 풀려 "아무 키나" 안내가 사라진다
await shot('main');
await jump(2); await cw("cw.state.flags.push('trigger_fired:floor1:baek', 'baek_left')"); await cw("cw.scene.go('floor1', 420)"); await wait(1200); await cw('cw.scene.teleportX(430)'); await wait(400);
await shot('play');
await jump(4); await cw("cw.scene.go('room_oh', 210)"); await wait(1200); await cw("cw.openDialogue('oh_miran')"); await page.waitForSelector('#dialogue'); await wait(2800); // 타이핑이 끝나 선택지·계속 표시가 보일 때까지
await shot('dialogue'); await closeAll();
await jump(5); await cw('cw.ui.notebook(0)'); await wait(200); for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown'); await wait(200);
await shot('notebook'); await closeAll();
await jump(2); await cw("cw.ui.acquire(['E02_altar_blood','E03_preliminary_exam','E04_wristband_fragment'])"); await cw("cw.ui.puzzle('P01_scene_rebuild')"); await wait(400);
await shot('puzzle');
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`제출용 스크린샷 5장 → ${OUT}/ (main, play, dialogue, notebook, puzzle)`);
