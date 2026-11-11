// 긴 선택지·제시 목록이 대화창 안에 들어오는지 확인 (창 크기 3종 × 장면 3종) → docs/screenshots/stage11_choices_<창>_<장면>[_before].png, 표는 콘솔
//   npx tsx tools/choice-shots.ts            (조정 후)
//   BEFORE=1 npx tsx tools/choice-shots.ts   (예전 스타일을 덮어써서 재현: 넘침 확인용)
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';

const BEFORE = process.env.BEFORE === '1';
execSync('npx vite build --mode e2e', { stdio: 'ignore' });
const browser = await launch();
const sizes: [number, number][] = [[1280, 720], [1920, 1080], [1366, 768]];
const rows: string[] = [];
for (const [w, h] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const cw = (fn: string) => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`);
  const go = async (jump: number) => { await page.goto(pathToFileURL(resolve('.tmp/e2e/index.html')).href); await page.waitForFunction(() => (window as any).__cw?.scene?.player); await page.waitForFunction(() => typeof (window as any).__cw.scene.jumpToScene === 'function'); await page.waitForSelector('#title'); await cw('cw.quick()'); await cw(`cw.scene.jumpToScene(${jump})`); await page.waitForTimeout(700); if (BEFORE) await page.addStyleTag({ content: '.dlg{display:block !important} .dlg .opts{overflow:visible !important;flex:none !important;min-height:auto !important}' }); };
  const scenarios: [string, number, string, (n: number) => Promise<boolean>][] = [
    ['preserve', 5, 'eunho_message', async () => (await page.locator('#dialogue .opt').count()) >= 2],
    ['confession', 5, 'jeong_haneul_final', async () => (await page.locator('#dialogue .opt').count()) >= 3],
    ['present', 3, 'jeong_haneul', async () => (await page.locator('#dialogue .opt', { hasText: '단서 제시' }).count()) >= 1],
  ];
  for (const [name, jump, id, ready] of scenarios) {
    await go(jump); if (name === 'present') await cw("cw.ui.acquire(['E05_access_log','E06_torn_sleeve','E07_report_revision','E08_miran_revised','E09_sedative_gap','E10_consent_forms','E11_transfer_order','E12_ledger'])"); // 가장 긴 제시 목록을 만든다
    await cw(`cw.openDialogue('${id}')`); await page.waitForSelector('#dialogue');
    for (let i = 0; i < 40 && !(await ready(i)); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(180); }
    await page.waitForTimeout(700);
    if (name === 'present') { await page.locator('#dialogue .opt', { hasText: '단서 제시' }).click(); await page.waitForTimeout(200); for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowDown'); }
    else { await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); }
    await page.waitForTimeout(300);
    const m = (await page.evaluate(`(() => {
      var rc = function (e) { return e ? e.getBoundingClientRect() : null; };
      var opts = document.querySelector('#dialogue .opts'), ob = rc(opts), sel = rc(document.querySelector('#dialogue .opt.sel'));
      var all = Array.prototype.map.call(document.querySelectorAll('#dialogue .opt'), function (e) { return e.getBoundingClientRect(); });
      var uiBottom = document.querySelector('#ui').getBoundingClientRect().bottom;
      return { uiBottom: uiBottom, lastBottom: Math.max.apply(null, all.map(function (q) { return q.bottom; })), selInside: !!sel && !!ob && sel.top >= ob.top - 4 && sel.bottom <= ob.bottom + 4, selInDlg: !!sel && sel.bottom <= uiBottom + 1, scroll: opts.scrollHeight > opts.clientHeight, n: all.length };
    })()`)) as { uiBottom: number; lastBottom: number; selInside: boolean; selInDlg: boolean; scroll: boolean; n: number };
    rows.push(`| ${w}×${h} | ${name} | ${m.n} | 마지막 줄 ${m.lastBottom > m.uiBottom + 1 ? '화면 밖(' + Math.round(m.lastBottom - m.uiBottom) + 'px)' : '안'} | 선택 줄 ${m.selInDlg && (BEFORE || m.selInside) ? '보임' : '안 보임'} | ${m.scroll ? '스크롤' : '-'} |`);
    await page.screenshot({ path: `docs/screenshots/stage11_choices_${w}x${h}_${name}${BEFORE ? '_before' : ''}.png` });
  }
  await page.close();
}
console.log(`${BEFORE ? '[조정 전 재현]' : '[조정 후]'}\n| 창 | 장면 | 항목 수 | 항목 위치 | 선택한 줄 | 비고 |\n|---|---|---|---|---|---|\n${rows.join('\n')}`);
await browser.close();
