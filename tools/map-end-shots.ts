// 맵 양 끝 스크린샷: 구역마다 맨 왼쪽·맨 오른쪽에 서서 찍는다 → .tmp/ends_<라벨>_<구역>_<L|R>.png (라벨은 인자: before|after)
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';

const label = process.argv[2] ?? 'after';
mkdirSync('.tmp', { recursive: true });
execSync('npx vite build --mode e2e', { stdio: 'ignore' });
const areas = JSON.parse(readFileSync('src/data/map.json', 'utf8')).areas as Record<string, { minX: number; maxX: number; walk?: { min: number; max: number } }>;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const cw = (fn: string) => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`);
await page.goto(pathToFileURL(resolve('.tmp/e2e/index.html')).href); await page.waitForFunction(() => (window as any).__cw?.scene?.player); await page.waitForSelector('#title');
await cw('cw.quick()'); await cw("cw.state.flags.push('trigger_fired:floor1:baek')"); await page.waitForTimeout(300);
for (const id of ['floor1', 'floor2', 'floor3', 'b1']) {
  const a = areas[id];
  const lo = (a as { walk?: { min: number; max: number } }).walk?.min ?? a.minX, hi = (a as { walk?: { min: number; max: number } }).walk?.max ?? a.maxX;
  for (const [side, x] of [['L', lo], ['R', hi]] as const) {
    await cw(`cw.scene.go('${id}', ${x})`); await page.waitForTimeout(900); await cw(`cw.scene.teleportX(${x})`); await page.waitForTimeout(400);
    await page.screenshot({ path: `.tmp/ends_${label}_${id}_${side}.png` });
  }
}
await browser.close(); console.log('ok', label);
