// 배치 6 적용 확인 스크린샷 → docs/screenshots/batch6_*.png
//   증거 상세 5장 · 엔딩 카드 A~D · 타이틀 · 원장실 평면도 · 철창문 잠김/열림
//   npx tsx tools/batch6-shots.ts
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';

execSync('npx vite build --mode e2e', { stdio: 'ignore' });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
const cw = (fn: string) => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`);
const wait = (ms: number) => page.waitForTimeout(ms);
const shot = (name: string) => page.screenshot({ path: `docs/screenshots/batch6_${name}.png` });
const fresh = async () => {
  await page.goto(pathToFileURL(resolve('.tmp/e2e/index.html')).href);
  await page.waitForFunction(() => (window as any).__cw?.scene?.player); await page.waitForSelector('#title');
};

// 타이틀 (메인 / 조작법 펼침 / 설정)
await fresh(); await wait(900); await shot('title');
await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await wait(200); await shot('title_controls');
await page.keyboard.press('Enter'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await wait(200); await shot('title_settings');

// 증거 상세
await fresh(); await cw('cw.quick()'); await wait(300);
for (const [id, n] of [['E01_last_letter', 'letter'], ['E02_altar_blood', 'altar_blood'], ['E04_wristband_fragment', 'wristband'], ['E06_torn_sleeve', 'torn_sleeve'], ['E09_sedative_gap', 'syringe_bag'], ['E14_belongings_diary', 'belongings']]) {
  await cw(`cw.ui.acquire(['${id}'])`); await wait(150);
  await cw(`cw.ui.viewer('${id}')`); await page.waitForSelector('#viewer');
  await wait(200); await shot(`ev_${n}`);
  await page.keyboard.press('Escape'); await wait(150);
}

// 엔딩 A~D
const ending = async (name: string, prep: string) => {
  await fresh(); await cw('cw.quick()'); await cw('cw.scene.jumpToScene(7)'); await wait(900); for (let i = 0; i < 4; i++) await page.keyboard.press('Escape');
  await cw('cw.state.evidenceSecured = true'); await cw(prep); await cw('cw.ui.ending()'); await page.waitForSelector('#ending'); await wait(200);
  for (let i = 0; i < 6 && !(await page.$('#ending .ecard')); i++) { await page.keyboard.press('Enter'); await wait(150); } // A 는 마지막 대본이 먼저
  await wait(250); await shot(`ending_${name}`);
};
await ending('a', 'cw.ui.conclude(true)');
await ending('b', "(cw.ui.conclude(true), ['claim_c', 'claim_d'].forEach((id) => cw.saveConclusion(cw.state, id, cw.claims.find((c) => c.claimId === id).hypotheses.find((h) => !h.isCorrect).id, [], [])))");
await ending('c', '(cw.ui.conclude(true), cw.state.evidenceSecured = false)');
await ending('d', 'cw.ui.conclude(false)');

// 원장실 평면도 · 철창문
await fresh(); await cw('cw.quick()'); await wait(200);
await cw("cw.scene.go('room_director', 0)"); await wait(900);
await cw('cw.scene.teleportX(330)'); await wait(400); await shot('plan');
await cw("cw.scene.go('floor1', 0)"); await wait(900); await cw('cw.scene.teleportX(1440)'); await wait(500); await shot('gate_locked');
await cw("cw.state.solvedPuzzleIds.push('P03_revision_diff', 'P04_approval_chain')"); await cw("cw.scene.refresh()"); await wait(500); await shot('gate_open'); // 열린 뒤 구역을 다시 그리면 art 로 바뀐다 (같은 자리·같은 문틀 상자)
await browser.close();
console.log(errors.length ? `오류: ${errors.join('\n')}` : '스크린샷 저장 (오류 없음)');
