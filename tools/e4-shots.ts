// 4차 피드백 스크린샷 → docs/screenshots/e4_<이름>.png  (PREFIX=before 로 돌리면 e4_before_* 로 저장)
//   NOBUILD=1 이 아니면 e2e 빌드를 먼저 한다.
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';
import { dismissRule, runDesktopCompare } from './puzzle-driver';

const PRE = process.env.PREFIX ? `${process.env.PREFIX}_` : '';
if (!process.env.NOBUILD) execSync('npx vite build --mode e2e', { stdio: 'ignore' });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors: string[] = []; page.on('pageerror', (e) => errors.push(String(e)));
const cw = (fn: string) => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`);
const wait = (ms: number) => page.waitForTimeout(ms);
const shot = (n: string) => page.screenshot({ path: `docs/screenshots/e4_${PRE}${n}.png` });
const key = async (k: string) => { await page.keyboard.press(k); await wait(120); };
const jump = async (n: number) => {
  await page.goto(pathToFileURL(resolve('.tmp/e2e/index.html')).href);
  await page.waitForFunction(() => typeof (window as any).__cw?.scene?.jumpToScene === 'function');
  await page.waitForSelector('#title'); await cw('cw.quick()');
  await cw(`cw.scene.jumpToScene(${n})`); await wait(700);
};
const openPuzzle = async (id: string, scene: number) => { await cw(`cw.ui.prepare(${scene})`); await cw(`cw.ui.puzzle('${id}')`); await page.waitForSelector('#puzzle'); await wait(350); };
const only = process.env.ONLY?.split(',');
const want = (k: string) => !only || only.includes(k);

if (want('p01')) {
  await jump(2); await openPuzzle('P01_scene_rebuild', 2); await dismissRule(page);
  await shot('P01_first');
  await page.locator('#puzzle [data-choice="c1_head"]').click(); await wait(150);
  await page.locator('#puzzle [data-choice="c2_fight"]').click(); await wait(150); await shot('P01_mid');
  if (!PRE) { await key('Tab'); await wait(300); await shot('P01_clues'); await key('Tab'); await wait(200); }
}
if (want('p03')) {
  await jump(4); await openPuzzle('P03_revision_diff', 4); await dismissRule(page);
  await shot('P03_start');
  await page.locator('#puzzle [data-icon="file:final"]').dblclick(); await wait(200);
  await page.locator('#puzzle [data-icon="trash"]').dblclick(); await wait(200);
  await page.locator('#puzzle [data-wfile="auto"]').click(); await wait(200);
  await page.locator('#puzzle [data-icon="compare"]').dblclick(); await wait(200);
  await shot('P03_windows');
  await runDesktopCompare(page); await wait(200); await shot('P03_result');
  const cyc = page.locator('#puzzle [data-cycle="chg_position"]'); await cyc.click(); await wait(250); await shot('P03_dropdown');
}
if (want('stairs')) { // 올라가는 계단·내려가는 계단 (1층 오른쪽 끝 / 2층 왼쪽 끝 / 2층 오른쪽 끝)
  for (const [area, x, name] of [['floor1', 1600, 'stairs_floor1_up'], ['floor2', 60, 'stairs_floor2_down'], ['floor2', 1330, 'stairs_floor2_up']] as const) {
    await jump(4); await cw(`cw.scene.buildArea('${area}', ${x})`); await wait(600); await shot(name);
  }
}
if (want('desk')) { // 사무실 책상 근접 조사
  await jump(1); await cw("cw.ui.closeup('office_desk')"); await page.waitForSelector('#closeup'); await wait(600); await shot('desk');
  await page.locator('#closeup .hot').nth(2).hover(); await wait(300); await shot('desk_newspaper_hover');
}
if (want('clock')) { // 201호·203호 벽시계
  for (const [area, x, name] of [['room_choi', 230, 'clock_201'], ['room_jeong', 305, 'clock_203']] as const) { await jump(4); await cw(`cw.scene.buildArea('${area}', ${x})`); await wait(600); await shot(name); }
}
console.log(errors.length ? `페이지 오류: ${errors.join(' | ')}` : '페이지 오류 없음');
await browser.close();
