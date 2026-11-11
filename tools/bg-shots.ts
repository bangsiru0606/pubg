// 구역 배경 확인 스크린샷: 벽 타일 이음새가 화면 가운데 오는 위치에서 찍는다 → docs/screenshots/stage8_bg_*.png
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';

execSync('npx vite build --mode e2e', { stdio: 'ignore' });
const url = pathToFileURL(resolve('.tmp/e2e/index.html')).href;
const assets = JSON.parse(readFileSync('public/assets/assets.json', 'utf8')) as Record<string, { w: number }>;
const map = JSON.parse(readFileSync('src/data/map.json', 'utf8')).areas as Record<string, { minX: number; bg?: { wall: string; floor: string } }>;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const cw = (fn: string) => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`);
const wait = (ms: number) => page.waitForTimeout(ms);
const jump = async (n: number) => {
  await page.goto(url); await page.waitForFunction(() => (window as any).__cw?.scene?.player);
  await page.waitForFunction(() => typeof (window as any).__cw.scene.jumpToScene === 'function');
  await page.waitForSelector('#title'); await cw('cw.quick()'); await cw(`cw.scene.jumpToScene(${n})`); await wait(900);
};
const shoot = async (area: string, name: string) => {
  const a = map[area], seam = a.minX + assets[a.bg!.wall].w; // 벽 타일 이음새 (첫 반복 경계)
  await cw(`cw.scene.go('${area}', ${seam})`); await wait(1000);
  await cw("cw.state.flags.push('trigger_fired:floor1:baek')");
  await cw(`cw.scene.teleportX(${seam})`); await wait(500);
  await page.screenshot({ path: `docs/screenshots/stage8_bg_${name}.png` });
  const fseam = a.minX + assets[a.bg!.floor].w; // 바닥 이음새도 가운데에 두고 한 장 더
  await cw(`cw.scene.teleportX(${fseam})`); await wait(500);
  await page.screenshot({ path: `docs/screenshots/stage8_bg_${name}_floorseam.png` });
};
await jump(4);
for (const [area, name] of [['room_director', 'director'], ['floor2', 'floor2'], ['room_choi', 'room201'], ['floor3', 'floor3'], ['room_baek', 'baek'], ['room_oh', 'nurse'], ['room_lee', 'lee']] as const) await shoot(area, name);
await jump(5); await shoot('b1', 'basement');
await browser.close(); console.log('ok');
