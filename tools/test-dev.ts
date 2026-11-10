// 개발 서버(vite dev)에서만 동작하는 디버그 메뉴(F9) 확인: 씬 점프 상태가 정상 플레이와 같은지 본다. npm run test:dev
import { createServer } from 'vite';
import { launch } from './browser';

const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5199/');
await page.waitForFunction(() => (window as any).__game?.scene.getScene('Explore')?.player, null, { timeout: 15000 });
const fails: string[] = [];
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails.push(msg); };
const sc = <T>(fn: string) => page.evaluate(`(() => { const s = window.__game.scene.getScene('Explore'); return ${fn}; })()`) as Promise<T>;
await page.waitForSelector('#title');
await page.keyboard.press('F9');
check((await page.locator('#debugmenu').count()) === 1, 'F9 로 디버그 메뉴가 열린다 (개발 서버)');
await page.locator('#debugmenu [data-j="3"]').click();
check((await sc<string>('s.areaId')) === 'floor2' && (await sc<boolean>("s.state.solvedPuzzleIds.includes('P01_scene_rebuild') && !s.state.solvedPuzzleIds.includes('P02_night_timeline')")), '씬 3 시작: 2층, P01 해결·P02 미해결');
await page.keyboard.press('F9');
await page.locator('#debugmenu [data-j="5"]').click();
check((await sc<string>('s.areaId')) === 'b1' && (await sc<boolean>("s.state.solvedPuzzleIds.length === 4")), '씬 5 시작: 지하, P01~P04 해결');
await page.keyboard.press('F9'); await page.locator('#debugmenu [data-a="state"]').click();
check((await page.locator('#dbgstate').innerText()).includes('해결한 퍼즐'), '상태 보기');
await page.locator('#debugmenu [data-j="7"]').click();
await page.waitForSelector('#report', { timeout: 3000 });
check(true, '씬 7 시작: 최종 보고서');
await browser.close(); await server.close();
check(errors.length === 0, `페이지 오류 0 ${errors.join(' | ')}`);
if (fails.length) { console.error(`FAIL ${fails.length}건`); process.exit(1); }
console.log('DEV OK');
