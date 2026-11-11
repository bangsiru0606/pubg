// 1층 첫 입장 연출 전 과정을 GIF 로: 플레이어가 걸어가고(걷기 그림), 카메라가 백선우로 옮겨 가고, 대화, 백선우 퇴장, 조작 풀림 → docs/screenshots/stage13_floor1_intro.gif
// 연출 중 플레이어·백선우의 현재 애니메이션 키도 로그로 남긴다 (걷는 동안 player_walk 여야 한다).
import { execSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';
import { findFfmpeg } from './audio-assets';

execSync('npx vite build --mode e2e', { stdio: 'ignore' });
const dir = '.tmp/gif_stage'; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const cw = <T>(fn: string) => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`) as Promise<T>;
await page.goto(pathToFileURL(resolve('.tmp/e2e/index.html')).href); await page.waitForFunction(() => (window as any).__cw?.scene?.player); await page.waitForSelector('#title');
await cw('cw.quick()'); await cw("cw.state.flags.push('intro_done', 'cutscene_done:hospital_intro')"); await page.waitForTimeout(300);
await cw("cw.scene.go('floor1', 0)"); // 컷신은 건너뛰고 1층 첫 입장 (stage 연출이 시작된다)
const log: string[] = [];
let n = 0, last = '', enterAt = 0, unlockedAt = 0;
for (let t = 0; t < 70000; t += 170) {
  await page.screenshot({ path: `${dir}/${String(n++).padStart(4, '0')}.png` });
  const s = await cw<{ locked: boolean; p: string; b: string; x: number; bx: number; dlg: boolean }>("({ locked: cw.scene.locked, p: cw.scene.player.anims.currentAnim ? cw.scene.player.anims.currentAnim.key : '-', b: cw.scene.npcSprites.get('baek') && cw.scene.npcSprites.get('baek').anims.currentAnim ? cw.scene.npcSprites.get('baek').anims.currentAnim.key : '-', x: Math.round(cw.scene.player.x), bx: cw.scene.npcSprites.get('baek') ? Math.round(cw.scene.npcSprites.get('baek').x) : -1, dlg: !!document.querySelector('#dialogue') })");
  const key = `${s.locked ? '잠김' : '풀림'} player=${s.p}@${s.x} baek=${s.b}@${s.bx}${s.dlg ? ' 대화' : ''}`;
  if (key.replace(/@-?\d+/g, '') !== last.replace(/@-?\d+/g, '')) { log.push(`t=${(t / 1000).toFixed(1)}s ${key}`); last = key; }
  if (s.dlg && t - enterAt > 1300) { await page.keyboard.press('Enter'); enterAt = t; }
  if (!s.locked && !s.dlg && t > 2000) { unlockedAt ||= t; if (t - unlockedAt > 1500) break; }
  await page.waitForTimeout(110);
}
await browser.close();
const ff = findFfmpeg()!;
const r = spawnSync(ff, ['-y', '-loglevel', 'error', '-framerate', '6', '-i', `${dir}/%04d.png`, '-vf', 'scale=480:-1:flags=neighbor,split[a][b];[a]palettegen[p];[b][p]paletteuse', '-loop', '0', 'docs/screenshots/stage13_floor1_intro.gif']);
if (r.status !== 0) throw new Error(String(r.stderr));
console.log(`프레임 ${n}장 → docs/screenshots/stage13_floor1_intro.gif\n${log.join('\n')}`);
