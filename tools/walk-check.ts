// 걷는 방향과 몸 방향이 맞는지 확인: 오프닝에서 박은호·플레이어를 표본 추출해 이동 방향(dx)과 flipX 로 계산한 바라보는 방향을 비교한다.
//   npx tsx tools/walk-check.ts
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';

execSync('npx vite build --mode e2e', { stdio: 'ignore' });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.goto(pathToFileURL(resolve('.tmp/e2e/index.html')).href);
await page.waitForFunction(() => (window as any).__cw?.scene?.player); await page.waitForSelector('#title');
await page.keyboard.press('Enter'); await page.waitForSelector('#namepopup'); await page.keyboard.press('Enter'); await page.waitForSelector('#closeup'); await page.keyboard.press('Escape');
// 오프닝을 진행하며 표본: 이동 중인 배우의 dx 와 flipX (Enter 는 짧게 눌러 연출 건너뛰기가 되지 않게 한다)
await page.evaluate(() => {
  const w = window as any, sc = w.__cw.scene, last = new Map<string, number>(); w.__samples = [];
  setInterval(() => {
    for (const [name, sp] of [['eunho', sc.actors.get('eunho')], ['player', sc.player]] as const) {
      if (!sp || !sp.visible) continue;
      const prev = last.get(name); last.set(name, sp.x);
      if (prev !== undefined && Math.abs(sp.x - prev) > 0.3) w.__samples.push({ who: name, dx: sp.x - prev, faces: sp.flipX ? 'flip' : 'noflip' });
    }
  }, 16);
});
for (let i = 0; i < 300 && (await page.evaluate(() => (window as any).__cw.scene.locked || !(window as any).__cw.scene.started)); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(150); }
// 조작이 풀리면 플레이어를 왼쪽·오른쪽으로 걷게 한다
await page.keyboard.down('ArrowRight'); await page.waitForTimeout(500); await page.keyboard.up('ArrowRight');
await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(500); await page.keyboard.up('ArrowLeft');
const samples = await page.evaluate(() => (window as any).__samples as { who: string; dx: number; faces: string }[]);
const summary = (who: string) => { const s = samples.filter((q) => q.who === who); const right = s.filter((q) => q.dx > 0), left = s.filter((q) => q.dx < 0); return `${who}: 오른쪽 이동 ${right.length}샘플 flipX=${[...new Set(right.map((q) => q.faces))].join('/') || '-'} · 왼쪽 이동 ${left.length}샘플 flipX=${[...new Set(left.map((q) => q.faces))].join('/') || '-'}`; };
console.log(summary('eunho')); console.log(summary('player'));
// 두 배우 모두 원본이 왼쪽을 보므로: 오른쪽으로 걸을 때 flip, 왼쪽으로 걸을 때 noflip 이어야 한다
const bad = samples.filter((q) => (q.dx > 0) !== (q.faces === 'flip'));
if (!samples.some((q) => q.who === 'eunho' && q.dx > 0) || !samples.some((q) => q.who === 'eunho' && q.dx < 0) || bad.length) { console.error(`FAIL 걷는 방향과 몸 방향이 맞지 않는 표본 ${bad.length}개`); await browser.close(); process.exit(1); }
console.log('OK 걷는 방향과 몸 방향이 모두 일치');
await browser.close();
