// 5차 피드백 스크린샷 → docs/screenshots/e5_*.png
//   symbols: 분류 기호(증거 ■ / 증언 “)가 수첩·보고서 서랍·카드·퍼즐 조각·제시 목록에서 같은지 한 장으로 모은다 (e5_symbols.png)
//   p02: P02 새 화면
//   NOBUILD=1 이 아니면 e2e 빌드를 먼저 한다.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { launch } from './browser';
import { dismissRule, placeCorrect } from './puzzle-driver';

if (!process.env.NOBUILD) execSync('npx vite build --mode e2e', { stdio: 'ignore' });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors: string[] = []; page.on('pageerror', (e) => errors.push(String(e)));
const cw = (fn: string) => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`);
const wait = (ms: number) => page.waitForTimeout(ms);
const key = async (k: string) => { await page.keyboard.press(k); await wait(150); };
const jump = async (n: number) => {
  await page.goto(pathToFileURL(resolve('.tmp/e2e/index.html')).href);
  await page.waitForFunction(() => typeof (window as any).__cw?.scene?.jumpToScene === 'function');
  await page.waitForSelector('#title'); await cw('cw.quick()');
  await cw(`cw.scene.jumpToScene(${n})`); await wait(800);
};
const only = process.env.ONLY?.split(',');
const want = (k: string) => !only || only.includes(k);
const tmp = (n: string) => `.tmp/e5_${n}.png`;

if (want('p02')) {
  await jump(4); await cw('cw.ui.prepare(4)'); await cw("cw.ui.puzzle('P02_night_timeline')"); await page.waitForSelector('#puzzle'); await wait(300); await dismissRule(page);
  await page.screenshot({ path: 'docs/screenshots/e5_P02_start.png' });
  await placeCorrect(page, 'P02_night_timeline'); await wait(200);
  await page.screenshot({ path: 'docs/screenshots/e5_P02_answer.png' });
}
if (want('symbols')) {
  // 1) 퍼즐 조각 (P02: 진술 ·· 단서)
  await jump(4); await cw('cw.ui.prepare(4)'); await cw("cw.ui.puzzle('P02_night_timeline')"); await page.waitForSelector('#puzzle'); await wait(300); await dismissRule(page);
  await page.screenshot({ path: tmp('piece') });
  await key('Escape'); await wait(300); while (await page.locator('#dialogue').count()) { await key('Enter'); }
  // 2) 수첩: 단서 탭 · 진술 탭
  await key('Tab'); await page.waitForSelector('#notebook'); await wait(200); await page.screenshot({ path: tmp('nb_evidence') });
  await key('ArrowRight'); await wait(200); await page.screenshot({ path: tmp('nb_statements') }); await key('Tab');
  // 3) 보고서 서랍과 꽂은 카드
  await jump(7); await page.waitForSelector('#report'); await wait(500);
  const cards = page.locator('#report .dc');
  if (await cards.count()) { await cards.nth(0).click(); await page.locator('#report [data-blank]').first().click().catch(() => {}); }
  await wait(250); await page.screenshot({ path: tmp('report') });
  // 4) 대화 제시 목록
  await jump(4); await cw("cw.openDialogue('test_baek_lobby')").catch(() => {}); await wait(600);
  if (await page.locator('#dialogue').count()) { await key('Enter'); await key('ArrowDown'); await key('Enter'); await wait(200); await page.screenshot({ path: tmp('picker') }); }
  // 한 장으로 모은다 (각 화면의 왼쪽 위 960×540 을 2×2)
  const names = ['piece', 'nb_evidence', 'nb_statements', 'report', 'picker'].filter((n) => existsSync(tmp(n)));
  const W = 960, H = 540, cols = 2, rows = Math.ceil(names.length / cols);
  const comp = await Promise.all(names.map(async (n, i) => ({ input: await sharp(tmp(n)).resize(W, H).png().toBuffer(), left: (i % cols) * W, top: Math.floor(i / cols) * H })));
  await sharp({ create: { width: W * cols, height: H * rows, channels: 3, background: '#111' } }).composite(comp).png().toFile('docs/screenshots/e5_symbols.png');
  console.log('모음:', names.join(', '));
}
console.log(errors.length ? `페이지 오류: ${errors.join(' | ')}` : '페이지 오류 없음');
await browser.close();
