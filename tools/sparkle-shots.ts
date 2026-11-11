// 조사 지점 반짝임 확인 스크린샷 → docs/screenshots/stage9_sparkle_*.png (반짝임이 켜진 프레임을 잡는다)
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';

execSync('npx vite build --mode e2e', { stdio: 'ignore' });
const url = pathToFileURL(resolve('.tmp/e2e/index.html')).href;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const cw = (fn: string) => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`);
await page.goto(url); await page.waitForFunction(() => (window as any).__cw?.scene?.player); await page.waitForSelector('#title');
await cw('cw.quick()'); await page.waitForTimeout(300);
await cw("cw.state.flags.push('baek_left', 'trigger_fired:floor1:baek')");
// [구역, 플레이어 x, 파일]  (플레이어를 지점에서 떨어뜨려 서 있게 하면 반짝임과 그림이 함께 보인다)
for (const [area, x, name] of [['floor1', 690, 'note_on'], ['floor1', 640, 'note_near'], ['room_director', 130, 'director_blood'], ['room_director', 600, 'director_desk'], ['b1', 810, 'basement_locker']] as const) {
  await cw(`cw.scene.go('${area}', ${x})`); await page.waitForTimeout(1100);
  for (let i = 0; i < 40; i++) { // 반짝임 2프레임 중 밝은 프레임(sparkle_0)일 때 찍는다
    const f = await cw("cw.scene.children.list.filter((c) => c.texture && c.texture.key.startsWith('sparkle')).map((c) => c.anims.currentFrame.textureKey)");
    if ((f as string[]).includes('sparkle_0')) break; await page.waitForTimeout(60);
  }
  await page.screenshot({ path: `docs/screenshots/stage9_sparkle_${name}.png`, clip: { x: 0, y: 200, width: 1920, height: 520 } });
}
await browser.close(); console.log('ok');
