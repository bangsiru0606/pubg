// 퍼즐 화면 스크린샷 → docs/screenshots/c_puzzle_*.png: 규칙 안내 · P01~P05 (빈 화면·놓은 화면·오답·확인 창·검증 실패) · P03 바탕화면 단계별
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';
import { confirm, dismissRule, placeCorrect, puzzleData } from './puzzle-driver';

if (!process.env.NOBUILD) execSync('npx vite build --mode e2e', { stdio: 'ignore' });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors: string[] = []; page.on('pageerror', (e) => errors.push(String(e)));
const cw = (fn: string) => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`);
const wait = (ms: number) => page.waitForTimeout(ms);
const shot = (n: string) => page.screenshot({ path: `docs/screenshots/c_puzzle_${n}.png` });
const jump = async (n: number) => { await page.goto(pathToFileURL(resolve('.tmp/e2e/index.html')).href); await page.waitForFunction(() => typeof (window as any).__cw?.scene?.jumpToScene === 'function'); await page.waitForSelector('#title'); await cw('cw.quick()'); await cw(`cw.scene.jumpToScene(${n})`); await wait(700); };
const SCENE: Record<string, number> = { P01_scene_rebuild: 2, P02_night_timeline: 4, P03_revision_diff: 4, P04_approval_chain: 4, P05_patient_code: 5 };
const open = async (id: string) => { await cw(`cw.ui.prepare(${SCENE[id]})`); await cw(`cw.ui.puzzle('${id}')`); await page.waitForSelector('#puzzle'); await wait(350); };

for (const id of Object.keys(SCENE)) {
  const k = id.slice(0, 3), p = puzzleData(id);
  await jump(SCENE[id]); await open(id);
  if (id === 'P01_scene_rebuild') await shot('rule');
  await dismissRule(page); await shot(`${k}_empty`);
  await placeCorrect(page, id); await wait(200); await shot(`${k}_placed`);
  // 오답 1번째(충돌 문장 + 힌트): 한 칸을 틀리게
  const wrongSlot = p.layout === 'desktop' ? 'fact_1' : p.layout === 'tree' ? 'doc_selection' : p.layout === 'logic' ? 'identity' : null;
  if (wrongSlot) {
    await page.locator('#puzzle [data-submit]').click(); await wait(200); await shot(`${k}_confirm`);
    await page.locator('#puzzle [data-confirm="no"]').click();
  }
  await page.setViewportSize({ width: 1280, height: 720 }); await wait(200); await shot(`${k}_1280`); await page.setViewportSize({ width: 1920, height: 1080 });
  await confirm(page); await wait(300); await shot(`${k}_solved`);
}
// P03 바탕화면 단계별
await jump(4); await open('P03_revision_diff'); await dismissRule(page);
await page.locator('#puzzle [data-icon="file:final"]').dblclick(); await wait(200); await shot('P03_desk_1_final');
await page.locator('#puzzle [data-icon="trash"]').dblclick(); await wait(200); await shot('P03_desk_2_trash');
await page.locator('#puzzle [data-wfile="auto"]').click(); await wait(200); await shot('P03_desk_3_autosave');
await page.locator('#puzzle [data-icon="compare"]').dblclick(); await wait(200); await shot('P03_desk_4_compare');
for (let i = 0; i < 3; i++) await page.locator('#puzzle [data-cmp="a"]').click();
await page.locator('#puzzle [data-cmp="b"]').click(); await page.locator('#puzzle [data-cmp="run"]').click(); await wait(200); await shot('P03_desk_5_result');
// 오답 1·2번째와 3번째(검증 실패): P04
await jump(4); await open('P04_approval_chain'); await dismissRule(page);
for (let i = 1; i <= 3; i++) {
  await placeCorrect(page, 'P04_approval_chain', i === 1 ? { doc_selection: ['lee_hanshin'] } : i === 2 ? { doc_selection: ['lee_hanshin'] } : { doc_selection: ['lee_hanshin'] });
  await confirm(page); await wait(250); await shot(`P04_wrong${i}`);
  if (i < 3) await wait(100);
}
await cw("cw.state.flags.includes('puzzle_failed:P04_approval_chain')").then((v) => console.log('P04 검증 실패 플래그', v));
await page.keyboard.press('Enter'); await wait(300);
await cw("cw.ui.notebook(0)"); await page.waitForSelector('#notebook'); await page.keyboard.press('ArrowLeft'); await wait(300); await shot('notebook_failed');
await page.keyboard.press('Escape');
// 보류하고 나가기
await jump(4); await open('P02_night_timeline'); await dismissRule(page);
await placeCorrect(page, 'P02_night_timeline', {}); await page.locator('#puzzle [data-hold]').click(); await wait(300);
console.log('보류 저장', await cw("JSON.stringify(cw.state.puzzleDrafts.P02_night_timeline)"));
// 검증 실패 상태의 최종 보고서·엔딩 (P03 검증 실패)
await jump(1); await cw('cw.quick()'); await wait(300);
await cw("cw.scene.jumpToScene(7, ['P03_revision_diff'])"); await page.waitForSelector('#report', { timeout: 5000 }); await wait(600); await shot('report_failed');
await jump(1); await cw('cw.quick()'); await wait(300);
await cw("cw.state.failedPuzzleIds.push('P03_revision_diff')"); await cw("cw.ui.acquire(['E03_preliminary_exam', 'E07_report_revision'])"); await cw('cw.ui.conclude(false)'); await cw('cw.ui.ending()'); await page.waitForSelector('#ending');
for (let i = 0; i < 4 && !(await page.locator('#ending .grade').count()); i++) { await page.keyboard.press('Enter'); await wait(250); }
await wait(300); await shot('ending_unverified');
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('ok');
