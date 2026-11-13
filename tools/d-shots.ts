// 후속 작업(P01 추리 문답·퍼즐 머리말·보고서 재설계·다시 추리하기) 스크린샷 → docs/screenshots/d_*.png
//   NOBUILD=1 이 아니면 e2e 빌드를 먼저 한다.
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';
import { dismissRule } from './puzzle-driver';

if (!process.env.NOBUILD) execSync('npx vite build --mode e2e', { stdio: 'ignore' });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors: string[] = []; page.on('pageerror', (e) => errors.push(String(e)));
const cw = (fn: string) => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`);
const wait = (ms: number) => page.waitForTimeout(ms);
const shot = (n: string) => page.screenshot({ path: `docs/screenshots/d_${n}.png` });
const shot2 = async (n: string) => { await shot(n); await page.setViewportSize({ width: 1280, height: 720 }); await wait(250); await page.screenshot({ path: `docs/screenshots/d_${n}_1280.png` }); await page.setViewportSize({ width: 1920, height: 1080 }); await wait(150); };
const key = async (k: string) => { await page.keyboard.press(k); await wait(120); };
const jump = async (n: number, fail?: string[]) => {
  await page.goto(pathToFileURL(resolve('.tmp/e2e/index.html')).href);
  await page.waitForFunction(() => typeof (window as any).__cw?.scene?.jumpToScene === 'function');
  await page.waitForSelector('#title'); await cw('cw.quick()');
  await cw(`cw.scene.jumpToScene(${n}${fail ? ', ' + JSON.stringify(fail) : ''})`); await wait(700);
};
const openPuzzle = async (id: string, scene: number) => { await cw(`cw.ui.prepare(${scene})`); await cw(`cw.ui.puzzle('${id}')`); await page.waitForSelector('#puzzle'); await wait(350); };

// ---- P01 추리 문답 (처음 · 중간 · 결론 확인 · 오답 힌트) ----
await jump(2); await openPuzzle('P01_scene_rebuild', 2); await dismissRule(page);
await shot2('P01_first');
await page.locator('#puzzle [data-choice="c1_head"]').click(); await wait(150);
await page.locator('#puzzle [data-choice="c2_seizure"]').click(); await wait(150); await shot2('P01_mid');
await page.locator('#puzzle [data-choice="c3_altar"]').click(); await page.locator('#puzzle [data-choice="c4_moved"]').click(); await wait(200); await shot2('P01_conclusion');
await page.locator('#puzzle [data-submit]').click(); await wait(200); await shot('P01_confirm');
await page.locator('#puzzle [data-confirm="yes"]').click(); await wait(300); await shot2('P01_wrong1');
// 머리말 잘림 확인용: P03·P04
for (const [id, n] of [['P03_revision_diff', 4], ['P04_approval_chain', 4]] as const) { await jump(n); await openPuzzle(id, n); await dismissRule(page); await shot2(`${id.slice(0, 3)}_header`); }

// ---- 보고서 ----
await jump(7); await wait(800);
await page.waitForSelector('#report'); await shot2('report_blank');
await page.locator('#report [data-blank]').click(); await wait(200); await shot('report_dropdown');
await page.locator('#report [data-opt]').nth(2).click(); await wait(100);
await page.locator('#report [data-slot="s0"]').click(); await wait(100);
await page.locator('#report [data-card="E02_altar_blood"]').click(); await wait(100);
await page.locator('#report [data-slot="s1"]').click(); await wait(100);
await page.locator('#report [data-card="E03_preliminary_exam"]').click(); await wait(100);
await page.locator('#report [data-slot="r0"]').click(); await wait(100);
await page.locator('#report [data-card="E07_report_revision"]').click(); await wait(100);
await shot2('report_filled');
await page.locator('#report [data-slot="s0"]').click(); await page.locator('#report [data-card="E01_last_letter"]').click(); await wait(150); await shot('report_rejected'); // 맥락·미검증 사유
await page.locator('#report [data-filter="record"]').click(); await wait(100); await shot('report_drawer_filter');
await page.locator('#report [data-stamp]').click(); await wait(150); await shot('report_stamped');
await cw(`(() => { const G = { claim_b: [['E04_wristband_fragment', 'E08_miran_revised'], ['E05_access_log']], claim_c: [['E07_report_revision', 'E08_miran_revised'], ['E06_torn_sleeve']], claim_d: [['E12_ledger', 'E14_belongings_diary'], ['E15_transport_manifest']] }; for (const [id, [sup, reb]] of Object.entries(G)) cw.saveConclusion(cw.state, id, cw.claims.find((x) => x.claimId === id).hypotheses.find((h) => h.isCorrect).id, sup, reb); })()`);
await key('Tab'); await key('Escape'); await wait(200); // 수첩을 열었다 닫으면 보고서가 저장된 결론을 다시 읽는다
await page.locator('#report [data-pg="4"]').click(); await wait(200); await shot2('report_submit_page'); await page.locator('#report .rprevfull').evaluate((e) => { (e as HTMLElement).scrollTop = 9999; }); await wait(150); await shot2('report_submit_scrolled');
await page.locator('#report [data-tg="external"]').click(); await wait(150);
await page.locator('#report [data-submit]').click(); await wait(200); console.log('MSG', await page.locator('#report .rmsg').innerText()); await shot('report_confirm');
await page.locator('#report [data-cf="yes"]').click(); await page.waitForSelector('#ending'); await wait(400);
for (let i = 0; i < 6 && !(await page.locator('#ending .grade').count()); i++) { await key('Enter'); await wait(200); }
await shot2('ending_retry_button');
await page.locator('#ending [data-b="0"]').click(); await page.waitForSelector('#report'); await wait(400); await shot2('report_retry');
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('ok');
