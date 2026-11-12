// 오프닝(박은호 입장·대화·퇴장) 전 과정을 GIF 로 → docs/screenshots/opening_eunho.gif, 연출 중 박은호·플레이어의 애니메이션 키 로그
// 연출 중 플레이어·백선우의 현재 애니메이션 키도 로그로 남긴다 (걷는 동안 player_walk 여야 한다).
import { execSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';
import { findFfmpeg } from './audio-assets';

execSync('npx vite build --mode e2e', { stdio: 'ignore' });
const dir = '.tmp/gif_opening'; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const cw = <T>(fn: string) => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`) as Promise<T>;
await page.goto(pathToFileURL(resolve('.tmp/e2e/index.html')).href); await page.waitForFunction(() => (window as any).__cw?.scene?.player); await page.waitForSelector('#title');
await page.keyboard.press('Enter'); await page.waitForSelector('#namepopup'); await page.keyboard.press('Enter'); await page.waitForSelector('#closeup'); await page.keyboard.press('Escape'); await page.waitForSelector('#dialogue'); // 실제 시작 경로: 이름 입력 → 책상 근접 조사 → 오프닝
const log: string[] = [];
let n = 0, last = '', enterAt = 0, unlockedAt = 0;
for (let t = 0; t < 70000; t += 170) {
  await page.screenshot({ path: `${dir}/${String(n++).padStart(4, '0')}.png` });
  const s = await cw<{ locked: boolean; p: string; b: string; x: number; bx: number; dlg: boolean }>("({ locked: cw.scene.locked, p: cw.scene.player.anims.currentAnim ? cw.scene.player.anims.currentAnim.key : '-', b: cw.scene.actors.get('eunho') && cw.scene.actors.get('eunho').anims.currentAnim ? cw.scene.actors.get('eunho').anims.currentAnim.key : '-', x: Math.round(cw.scene.player.x), bx: cw.scene.actors.get('eunho') ? Math.round(cw.scene.actors.get('eunho').x) : -1, dlg: !!document.querySelector('#dialogue') })");
  const key = `${s.locked ? '잠김' : '풀림'} player=${s.p}@${s.x} eunho=${s.b}@${s.bx}${s.dlg ? ' 대화' : ''}`;
  if (key.replace(/@-?\d+/g, '') !== last.replace(/@-?\d+/g, '')) { log.push(`t=${(t / 1000).toFixed(1)}s ${key}`); last = key; }
  if (s.dlg && t - enterAt > 1300) { await page.keyboard.press('Enter'); enterAt = t; }
  if (!s.dlg && t - enterAt > 1300 && (await page.$('#closeup, #viewer, .docs'))) { await page.keyboard.press('Escape'); enterAt = t; } // 문서 보기 등 오버레이는 닫는다
  if (!s.locked && !s.dlg && t > 2000) { unlockedAt ||= t; if (t - unlockedAt > 1500) break; }
  await page.waitForTimeout(110);
}
await browser.close();
const ff = findFfmpeg()!;
const r = spawnSync(ff, ['-y', '-loglevel', 'error', '-framerate', '6', '-i', `${dir}/%04d.png`, '-vf', 'scale=480:-1:flags=neighbor,split[a][b];[a]palettegen[p];[b][p]paletteuse', '-loop', '0', 'docs/screenshots/opening_eunho.gif']);
if (r.status !== 0) throw new Error(String(r.stderr));
console.log(`프레임 ${n}장 → docs/screenshots/opening_eunho.gif\n${log.join('\n')}`);
