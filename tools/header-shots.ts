// 퍼즐 머리말이 잘리지 않는지: P01~P05 를 1280×720·1920×1080 에서 열어 머리말 아래 칸과의 간격을 잰다 → docs/screenshots/hdr_*.png
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';
import { dismissRule } from './puzzle-driver';

if (!process.env.NOBUILD) execSync('npx vite build --mode e2e', { stdio: 'ignore' });
const browser = await launch();
const errors: string[] = []; let bad = 0;
const SCENE: Record<string, number> = { P01_scene_rebuild: 2, P02_night_timeline: 4, P03_revision_diff: 4, P04_approval_chain: 4, P05_patient_code: 5 };
for (const [w, h] of [[1920, 1080], [1280, 720]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } }); page.on('pageerror', (e) => errors.push(String(e)));
  const cw = (fn: string) => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`);
  for (const [id, n] of Object.entries(SCENE)) {
    await page.goto(pathToFileURL(resolve('.tmp/e2e/index.html')).href);
    await page.waitForFunction(() => typeof (window as any).__cw?.scene?.jumpToScene === 'function'); await page.waitForSelector('#title'); await cw('cw.quick()');
    await cw(`cw.scene.jumpToScene(${n})`); await page.waitForTimeout(700); await cw(`cw.ui.prepare(${n})`); await cw(`cw.ui.puzzle('${id}')`); await page.waitForSelector('#puzzle'); await page.waitForTimeout(300); await dismissRule(page);
    const r = (await page.evaluate(`(() => { const q = (s) => document.querySelector(s); const t = q('#puzzle .ptitle'), tb = t.getBoundingClientRect(); const sub = q('#puzzle .psub'); const kids = ['#puzzle .pz-main', '#puzzle .pz-side'].map(q).filter((e) => e && getComputedStyle(e).display !== 'none'); return { textBottom: (sub || t).getBoundingClientRect().bottom, below: Math.min(...kids.map((e) => e.getBoundingClientRect().top)) }; })()`)) as { textBottom: number; below: number };
    const ok = r.textBottom <= r.below + 0.5; if (!ok) bad++;
    console.log(`${w}x${h} ${id.slice(0, 3)} 머리말 아래 ${r.textBottom.toFixed(1)} ≤ 아래 칸 위 ${r.below.toFixed(1)} ${ok ? 'OK' : 'FAIL 잘림'}`);
    await page.screenshot({ path: `docs/screenshots/hdr_${id.slice(0, 3)}_${w}.png` });
  }
  await page.close();
}
await browser.close();
if (errors.length || bad) { console.error('FAIL', errors.join(' | '), bad); process.exit(1); }
