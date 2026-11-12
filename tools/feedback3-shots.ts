// 플레이 테스트 3차 스크린샷 → docs/screenshots/fb3_*.png
//   메시지 띠 · 대사 기록 · P05 힌트 · 신문 근접 조사(대체 표시) · 지하 첫 입장 컷신 · 정하늘 등장 · 부원장 PC · 이사실 문 · 계단 · 타이틀(이어하기 회색) · 설정 · 전체화면(1920×1080 ×4, 화면 채우기)
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';

const OUT = 'docs/screenshots';
mkdirSync(OUT, { recursive: true });
if (!process.env.NOBUILD) execSync('npx vite build --mode e2e', { stdio: 'ignore' });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors: string[] = []; page.on('pageerror', (e) => errors.push(String(e)));
const cw = (fn: string) => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`);
const wait = (ms: number) => page.waitForTimeout(ms);
const shot = (n: string, clip?: { x: number; y: number; width: number; height: number }) => page.screenshot({ path: `${OUT}/fb3_${n}.png`, clip });
const load = async () => { await page.goto(pathToFileURL(resolve('.tmp/e2e/index.html')).href); await page.waitForFunction(() => (window as any).__cw?.scene?.player); await page.waitForFunction(() => typeof (window as any).__cw.scene.jumpToScene === 'function'); await page.waitForSelector('#title'); };
const quick = async () => { await cw('cw.quick()'); await cw("cw.state.flags.push('trigger_fired:floor1:baek')"); await wait(300); };

// 타이틀: 저장이 없으면 이어하기가 회색
await load(); await wait(300); await shot('title_nosave');
await page.keyboard.press('ArrowDown'); await wait(150); await shot('title_nosave_down'); // 이어하기를 건너뛰고 조작법에 선택이 간다
await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await wait(250); await shot('settings');
await page.setViewportSize({ width: 1366, height: 768 }); await wait(200);
await page.locator('#title [data-v="5"]').click(); await wait(250); await shot('settings_fill_1366'); // 화면 채우기 켬
await page.keyboard.press('Escape'); await wait(200); await shot('title_fill_1366');
await page.evaluate(() => localStorage.removeItem('confession-ward-display')); // 설정 되돌리기
await page.setViewportSize({ width: 1920, height: 1080 });

// 전체화면 ×4 (1920×1080): 정수 배율 기본. 타이틀의 "전체화면 켜기"로 실제 Fullscreen API 도 시험한다 (헤드리스에서 막히면 건너뛴다)
await load(); await wait(300);
const labels = await page.locator('#title .tm .opt').allInnerTexts(); console.log('타이틀 메뉴', labels.join(' | '));
await page.locator('#title .tm .opt', { hasText: '전체화면' }).click(); await wait(500);
console.log('fullscreenElement', await page.evaluate(() => !!document.fullscreenElement), 'viewport', await page.evaluate(() => `${innerWidth}x${innerHeight}`));
await shot('fullscreen_1920_title');
if (await page.evaluate(() => !!document.fullscreenElement)) await page.evaluate(() => document.exitFullscreen());
await quick(); await wait(300); await shot('fullscreen_1920_play');
console.log('stage', await page.evaluate(() => `${(document.getElementById('stage') as HTMLElement).style.width}x${(document.getElementById('stage') as HTMLElement).style.height}`));

// 메시지 띠, 대사 기록
await cw("cw.ff(true)"); await wait(900);
await cw("cw.openDialogue('eunho_message')"); await wait(1500); await shot('message_band'); // 첫 노드 m1 (받은 메시지)
await page.keyboard.press('Enter'); await wait(100); await page.keyboard.press('Enter'); await wait(1200);
await page.keyboard.press('l'); await wait(300); await shot('backlog_in_dialogue');
await page.keyboard.press('Escape'); await wait(200);

// 지하: 정하늘 등장 (발소리 → 걸어 들어옴 → 대화), 올라가는 계단 반전
await load(); await quick(); await cw("cw.scene.go('b1', 810)"); await wait(900); await cw('cw.scene.teleportX(810)');
await shot('b1_stairs_flip', { x: 0, y: 0, width: 1920, height: 1080 });
await cw("cw.scene.go('b1', 100)"); await wait(900); await cw('cw.scene.teleportX(60)'); await wait(200); await shot('b1_left_edge');
await cw("cw.scene.go('b1', 810)"); await wait(900); await cw('cw.scene.teleportX(810)');
await cw("['E12_ledger','E13_identity_map','E15_transport_manifest'].forEach((id) => cw.ui.acquire([id]))"); await cw("cw.state.flags.push('diary_closed')");
await wait(600);
const frames: string[] = [];
for (let i = 0; i < 14; i++) { await wait(700); const p = `${OUT}/fb3_haneul_${String(i).padStart(2, '0')}.png`; await page.screenshot({ path: p }); frames.push(p); if (await page.locator('#dialogue').count()) break; }
await wait(1200); await shot('haneul_dialogue');
console.log('정하늘 프레임', frames.length);

// P05 힌트 3단계(가장 긴 안내): 오른쪽 칸이 잘리지 않는다
await load(); await quick(); await cw('cw.scene.jumpToScene(5)'); await wait(700); await cw('cw.ui.prepare(5)');
await cw("cw.state.wrongCountByPuzzle.P05_patient_code = 6"); await cw("cw.ui.puzzle('P05_patient_code')"); await page.waitForSelector('#puzzle'); await wait(400);
const m = await page.evaluate(() => { const r = document.querySelector('#puzzle .pright') as HTMLElement, f = document.querySelector('#puzzle .pfb') as HTMLElement | null, h = document.querySelector('#puzzle .hint-t') as HTMLElement | null;
  const rr = r.getBoundingClientRect(), hr = h?.getBoundingClientRect(); return { rightH: Math.round(rr.height), fbScroll: f ? [f.scrollHeight, f.clientHeight] : null, hintInside: hr ? hr.top >= rr.top - 1 && hr.bottom <= rr.bottom + 1 : null, hint: h?.textContent }; });
console.log('P05 힌트', JSON.stringify(m)); await shot('p05_hint');
await page.keyboard.press('Escape');

// 사무실 책상 근접 조사: 신문(대체 표시) + 상세(기사 HTML)
await load(); await quick(); await cw("cw.ui.closeup('office_desk')"); await page.waitForSelector('#closeup'); await wait(400);
await page.locator('#closeup .hot').nth(2).hover(); await wait(200); await shot('newspaper_hover');
await page.locator('#closeup .hot').nth(2).click(); await page.waitForSelector('#closeup-detail'); await wait(300); await shot('newspaper_detail');
await page.keyboard.press('Escape'); await page.keyboard.press('Escape');

// 지하 첫 입장 컷신 (그림은 pending: 대체 배경) + 독백
await load(); await quick(); await cw("cw.scene.go('floor1', 1420)"); await wait(900); await cw('cw.scene.teleportX(1440)');
await cw("cw.state.solvedPuzzleIds.push('P03_revision_diff', 'P04_approval_chain')"); await wait(100);
await page.keyboard.press('Enter'); await page.waitForSelector('#cutscene'); await wait(1500); await shot('basement_intro');
await page.keyboard.press('Escape');

// 부원장실 PC(책상 위 대체 그림), 3층 이사실 문
await load(); await quick(); await cw("cw.scene.go('room_baek', 300)"); await wait(900); await cw('cw.scene.teleportX(330)'); await wait(300); await shot('room_baek_pc');
await cw("cw.scene.go('floor3', 800)"); await wait(900); await cw('cw.scene.teleportX(850)'); await wait(300); await shot('floor3_door_lee');

await browser.close();
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('ok');
