// 나가기·닫기 버튼 전/후와 비교 이미지: docs/screenshots/stage13_exit_{before,after}[_1280].png, exit_buttons.png
//   "전" 은 예전 스타일(올리브 초록 그라데이션 상자, "나가기 (Esc)")을 덮어써서 재현한다.
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp, { type OverlayOptions } from 'sharp';
import { launch } from './browser';

execSync('npx vite build --mode e2e', { stdio: 'ignore' });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const cw = (fn: string) => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`);
const wait = (ms: number) => page.waitForTimeout(ms);
const fresh = async () => { await page.goto(pathToFileURL(resolve('.tmp/e2e/index.html')).href); await page.waitForFunction(() => (window as any).__cw?.scene?.player); await page.waitForFunction(() => typeof (window as any).__cw.scene.jumpToScene === 'function'); await page.waitForSelector('#title'); await cw('cw.quick()'); await wait(300); };
const OLD = '.closeup .wbtn.exit { background: linear-gradient(180deg, #4b5a3a, #2e3a22) !important; padding: 1px 8px !important; font-size: 9px !important; font-weight: 400 !important; color: #e9e4d8 !important; box-shadow: none !important; right: 6px !important; bottom: 6px !important; } .closeup .wbtn.exit kbd { display: none; }';

await fresh(); await cw('cw.scene.teleportX(67.5)'); await wait(100); await page.keyboard.press('Enter'); await page.waitForSelector('#closeup'); await wait(500);
await page.addStyleTag({ content: OLD }); await page.evaluate(() => { document.querySelector('.closeup .exit span')!.textContent = '나가기 (Esc)'; }); await wait(100);
await page.screenshot({ path: 'docs/screenshots/stage13_exit_before.png' });
await page.setViewportSize({ width: 1280, height: 720 }); await wait(200); await page.screenshot({ path: 'docs/screenshots/stage13_exit_before_1280.png' }); await page.setViewportSize({ width: 1920, height: 1080 });
await fresh(); await cw('cw.scene.teleportX(67.5)'); await wait(100); await page.keyboard.press('Enter'); await page.waitForSelector('#closeup'); await wait(500);
await page.screenshot({ path: 'docs/screenshots/stage13_exit_after.png' });
await page.setViewportSize({ width: 1280, height: 720 }); await wait(200); await page.screenshot({ path: 'docs/screenshots/stage13_exit_after_1280.png' });
await page.mouse.move(1000, 600); await page.locator('.closeup .exit').hover(); await wait(150); await page.screenshot({ path: 'docs/screenshots/stage13_exit_hover_1280.png', clip: { x: 160 + 700, y: 90 + 400, width: 260, height: 140 } });
await page.setViewportSize({ width: 1920, height: 1080 }); await wait(200);

// 비교 이미지: 같은 역할(나가기·닫기)의 안내/버튼 — 근접 조사(버튼) · 상세 보기(버튼) · 퍼즐·수첩·보고서·원문(아래 안내 줄)
const crops: [string, Buffer][] = [];
const bottom = async (label: string, h = 150) => crops.push([label, await page.screenshot({ clip: { x: 0, y: 1080 - h, width: 1920, height: h } })]);
await bottom('근접 조사: 나가기 버튼 (공통 .wbtn)', 190);
await page.locator('.hot').first().click(); await wait(300); await bottom('상세 보기: 닫기 버튼 (공통 .wbtn)', 330);
await page.keyboard.press('Enter'); await page.keyboard.press('Escape'); await wait(200);
await cw('cw.scene.jumpToScene(4)'); await wait(600); await cw('cw.ui.prepare(4)'); await cw("cw.ui.puzzle('P03_revision_diff')"); await wait(400); await bottom('퍼즐: 아래 안내 줄 (Esc 나가기)'); await page.keyboard.press('Escape'); await wait(200);
await cw('cw.ui.notebook(0)'); await wait(300); await bottom('사건 수첩: 아래 안내 줄 (Esc/Tab 닫기)'); await page.keyboard.press('Escape'); await wait(200);
await cw('cw.ui.acquire(["E03_preliminary_exam"])'); await cw("cw.openDialogue('mono_altar')"); await wait(200); await page.keyboard.press('Escape');
await browser.close();
const W = 1920 / 2, comp: OverlayOptions[] = []; let y = 0; const labels: string[] = [];
for (const [label, buf] of crops) { const b = await sharp(buf).resize({ width: W }).png().toBuffer(), m = await sharp(b).metadata(); comp.push({ input: b, left: 0, top: y + 18 }); labels.push(`<text x="4" y="${y + 13}" font-size="13" fill="#e8dcc0" font-family="sans-serif">${label}</text>`); y += m.height! + 22; }
await sharp({ create: { width: W, height: y, channels: 3, background: '#181818' } }).composite([...comp, { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}">${labels.join('')}</svg>`), left: 0, top: 0 }]).png().toFile('docs/screenshots/exit_buttons.png');
console.log('나가기 버튼 스크린샷 저장');
