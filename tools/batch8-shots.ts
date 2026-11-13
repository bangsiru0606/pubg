// 배치 8·교단 자료 스크린샷 → docs/screenshots/b8_*.png (.tmp/e2e 빌드를 쓴다: NOBUILD=1 이 아니면 먼저 빌드)
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';

if (!process.env.NOBUILD) execSync('npx vite build --mode e2e', { stdio: 'ignore' });
const OUT = 'docs/screenshots';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors: string[] = []; page.on('pageerror', (e) => errors.push(String(e)));
const cw = (fn: string) => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`);
const wait = (ms: number) => page.waitForTimeout(ms);
const shot = (n: string) => page.screenshot({ path: `${OUT}/b8_${n}.png` });
const load = async () => { await page.goto(pathToFileURL(resolve('.tmp/e2e/index.html')).href); await page.waitForFunction(() => (window as any).__cw?.scene?.player); await page.waitForSelector('#title'); await cw('cw.quick()'); await cw("cw.state.flags.push('trigger_fired:floor1:baek')"); await wait(300); };
const at = async (area: string, x: number) => { await cw(`cw.scene.go('${area}', ${x})`); await wait(900); await cw(`cw.scene.teleportX(${x})`); await wait(400); };

await load();
// 내려가는 계단 (stairs_down_v2)
await at('floor2', 0); await shot('stairs_floor2');
await at('floor3', 0); await shot('stairs_floor3');
// 맥락 문서: 교리 액자 1·2층, 기도 자리, 감사패, 설교 원고
await at('floor1', 980); await shot('doctrine_floor1_scene'); await page.keyboard.press('Enter'); await page.waitForSelector('#viewer'); await wait(400); await shot('doctrine_floor1_doc'); await page.keyboard.press('Enter');
await at('floor2', 675); await page.keyboard.press('Enter'); await page.waitForSelector('#viewer'); await wait(400); await shot('doctrine_floor2_doc'); await page.keyboard.press('Enter');
await at('room_choi', 300); await shot('prayer_scene'); await page.keyboard.press('Enter'); await page.waitForSelector('#viewer'); await wait(400); await shot('prayer_doc'); await page.keyboard.press('Enter');
await at('room_lee', 420); await shot('plaque_scene'); await page.keyboard.press('Enter'); await page.waitForSelector('#viewer'); await wait(400); await shot('plaque_doc'); await page.keyboard.press('Enter');
await at('b1', 600); await shot('sermon_scene'); await page.keyboard.press('Enter'); await page.waitForSelector('#viewer'); await wait(400); await shot('sermon_doc'); await page.keyboard.press('Enter');
// 부원장 PC(desk_pc), 신문(근접 조사)
await at('room_baek', 330); await shot('desk_pc');
await cw("cw.ui.closeup('office_desk')"); await page.waitForSelector('#closeup'); await wait(500);
await page.locator('#closeup .hot').nth(2).hover(); await wait(300); await shot('newspaper_hover');
await page.locator('#closeup .hot').nth(2).click(); await page.waitForSelector('#closeup-detail'); await wait(400); await shot('newspaper_detail');
await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await wait(200);
// 지하 첫 입장 컷신(그림)
await cw("cw.state.flags = cw.state.flags.filter((f) => f !== 'cutscene_done:basement_intro')");
await at('floor1', 1440); await cw("cw.state.flags.push('basement_key')"); await wait(100);
await page.keyboard.press('Enter'); await page.waitForSelector('#cutscene'); await wait(1800); await shot('basement_intro'); await page.keyboard.press('Escape');
// 정하늘 등장(idle_side) — 지하
await load(); await at('b1', 810);
await cw("['E12_ledger','E13_identity_map','E15_transport_manifest'].forEach((id) => cw.ui.acquire([id]))"); await cw("cw.state.flags.push('diary_closed')");
for (let i = 0; i < 16 && !(await page.locator('#dialogue').count()); i++) await wait(700);
await wait(900); await shot('haneul_side_dialogue');
// 장부(E12)·운송표(E15) 본문, 수첩 미결 사건
await load(); await cw("cw.ui.viewer('E12_ledger')"); await page.waitForSelector('#viewer'); await wait(400); await shot('e12_ledger'); await page.keyboard.press('Enter');
await cw("cw.ui.viewer('E15_transport_manifest')"); await page.waitForSelector('#viewer'); await wait(400); await shot('e15_manifest'); await page.keyboard.press('Enter');
await cw('cw.ui.prepare(2)'); await cw('cw.ui.prepare(3)'); await cw('cw.ui.prepare(4)');
await cw('cw.ui.notebook(0)'); await page.waitForSelector('#notebook'); await page.keyboard.press('ArrowLeft'); await wait(300); await shot('notebook_pending');
await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('ok');
