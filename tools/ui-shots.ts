// 화면 디자인 전후 비교용 스크린샷: npx tsx tools/ui-shots.ts before|after  → docs/screenshots/stage7_ui_<phase>_<이름>[_1280].png
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';

const phase = process.argv[2] ?? 'after';
execSync('npx vite build --mode e2e', { stdio: 'ignore' });
const url = pathToFileURL(resolve('.tmp/e2e/index.html')).href;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
const cw = (fn: string) => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`);
const wait = (ms: number) => page.waitForTimeout(ms);
const key = async (k: string, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await wait(40); } };
const shot = async (name: string) => {
  for (const [w, h, suffix] of [[1920, 1080, ''], [1280, 720, '_1280']] as const) {
    await page.setViewportSize({ width: w, height: h }); await wait(200);
    await page.screenshot({ path: `docs/screenshots/stage7_ui_${phase}_${name}${suffix}.png` });
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
};
const fresh = async () => { await page.goto(url); await page.waitForFunction(() => (window as any).__cw?.scene?.player); await page.waitForFunction(() => typeof (window as any).__cw.scene.jumpToScene === 'function'); };
const jump = async (n: number) => { await fresh(); await page.waitForSelector('#title'); await cw('cw.quick()'); await cw(`cw.scene.jumpToScene(${n})`); await wait(900); };
const closeAll = async () => { for (let i = 0; i < 4; i++) await page.keyboard.press('Escape'); await wait(100); };

await fresh(); await page.waitForSelector('#title'); await wait(300); await shot('title');
await jump(2); await cw("cw.openDialogue('eunho_intro')"); await page.waitForSelector('#dialogue'); await wait(1500); await key('Enter'); await shot('dialogue'); await closeAll();
await jump(5); await cw('cw.ui.notebook(0)'); await wait(200); await key('ArrowDown', 3); await shot('notebook_evidence'); await closeAll();
await cw('cw.ui.notebook(1)'); await wait(200); await key('ArrowDown', 2); await shot('notebook_statements'); await closeAll();
await cw("cw.ui.conclude(true)"); await cw('cw.ui.notebook(2)'); await wait(200); await key('ArrowDown'); await shot('notebook_claim'); await closeAll();
await jump(2); await cw("cw.ui.acquire(['E02_altar_blood','E03_preliminary_exam','E04_wristband_fragment'])"); await cw("cw.ui.puzzle('P01_scene_rebuild')"); await wait(300); await shot('p01'); await closeAll();
await jump(4); await cw("cw.ui.acquire(['E07_report_revision'])"); await cw("cw.ui.puzzle('P03_revision_diff')"); await wait(300); await shot('p03'); await closeAll();
await jump(5); await cw("cw.ui.acquire(['E12_ledger','E13_identity_map','E14_belongings_diary','E15_transport_manifest'])"); await cw("cw.ui.puzzle('P05_patient_code')"); await wait(300); await shot('p05'); await closeAll();
await jump(7); await cw("cw.ui.conclude(true)"); await key('ArrowUp'); await key('ArrowDown'); await shot('report'); await closeAll();
await jump(7); await closeAll(); await cw("cw.ui.conclude(true)"); await cw('cw.ui.ending()'); await page.waitForSelector('#ending'); await key('Enter', 3); await shot('ending_a');
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`화면 스크린샷 (${phase}) 저장`);
