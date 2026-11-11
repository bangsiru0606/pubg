// 소품 배치 확인 스크린샷: 구역마다 조사 지점·소품 위치로 가서 찍고, 구역별 시트로 합친다 → docs/screenshots/stage8_props_<구역>.png
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { launch } from './browser';

execSync('npx vite build --mode e2e', { stdio: 'ignore' });
const url = pathToFileURL(resolve('.tmp/e2e/index.html')).href;
const map = JSON.parse(readFileSync('src/data/map.json', 'utf8')).areas as Record<string, { interactables: { x: number }[]; objects?: { x: number }[]; props?: { x: number }[] }>;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const cw = (fn: string) => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`);
const wait = (ms: number) => page.waitForTimeout(ms);
const jump = async (n: number) => {
  await page.goto(url); await page.waitForFunction(() => (window as any).__cw?.scene?.player);
  await page.waitForFunction(() => typeof (window as any).__cw.scene.jumpToScene === 'function');
  await page.waitForSelector('#title'); await cw('cw.quick()'); await cw(`cw.scene.jumpToScene(${n})`); await wait(900);
};
const only = process.argv.slice(2);
const shoot = async (area: string, name: string) => {
  const a = map[area];
  const xs = [...a.interactables, ...(a.objects ?? []), ...(a.props ?? [])].map((o) => o.x).sort((p, q) => p - q);
  const spots: number[] = []; for (const x of xs) if (!spots.length || x - spots[spots.length - 1] >= 230) spots.push(x);
  await cw(`cw.scene.go('${area}', ${spots[0]})`); await wait(1000);
  await cw("cw.state.flags.push('trigger_fired:floor1:baek')");
  const bufs: Buffer[] = [];
  for (const x of spots) { await cw(`cw.scene.teleportX(${x})`); await wait(450); bufs.push(await page.screenshot({ clip: { x: 0, y: 0, width: 1920, height: 1080 } })); }
  const small = await Promise.all(bufs.map((b) => sharp(b).resize({ width: 800 }).png().toBuffer()));
  const rows = Math.ceil(small.length / 2);
  await sharp({ create: { width: 1600, height: 450 * rows, channels: 3, background: '#000' } }).composite(small.map((input, i) => ({ input, left: (i % 2) * 800, top: Math.floor(i / 2) * 450 }))).png().toFile(`docs/screenshots/stage8_props_${name}.png`);
  console.log(name, spots);
};
await jump(4);
for (const [area, name] of [['floor1', 'floor1'], ['room_director', 'director'], ['floor2', 'floor2'], ['room_choi', 'room201'], ['room_jeong', 'room203'], ['floor3', 'floor3'], ['room_baek', 'baek'], ['room_oh', 'nurse'], ['room_lee', 'lee']] as const) if (!only.length || only.includes(name)) await shoot(area, name);
await jump(5); if (!only.length || only.includes('basement')) await shoot('b1', 'basement');
await browser.close(); console.log('ok');
