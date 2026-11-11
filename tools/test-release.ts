// zip을 임시 폴더에 풀어 file:// 로 열고 자동 확인
import AdmZip from 'adm-zip';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';

// 생성 대기(pending) 에셋이 남아 있으면 제출 빌드로 인정하지 않는다 (플레이 시험은 ALLOW_PENDING=1 로 경고만)
{
  const spec = JSON.parse(readFileSync('art/asset-spec.json', 'utf8')) as { pending?: string[] };
  const chars = (JSON.parse(readFileSync('src/data/characters.json', 'utf8')).characters as { id: string; pending?: boolean }[]).filter((c) => c.pending);
  const n = (spec.pending?.length ?? 0) + chars.length;
  if (n) {
    const msg = `생성 대기(pending) 항목 ${n}개 남음: 텍스처 ${spec.pending?.length ?? 0}개, 초상 인물 ${chars.length}명`;
    if (process.env.ALLOW_PENDING === '1') console.warn(`! ${msg} (ALLOW_PENDING=1 이라 계속한다)`);
    else { console.error(`FAIL ${msg} — 모두 적용하거나 ALLOW_PENDING=1 로 실행한다`); process.exit(1); }
  }
}

const dir = mkdtempSync(join(tmpdir(), 'cw-'));
new AdmZip('release/ConfessionWard_v1.0_web.zip').extractAllTo(dir, true);
const url = pathToFileURL(join(dir, 'ConfessionWard_v1.0_web', 'index.html')).href;

const html = readFileSync(join(dir, 'ConfessionWard_v1.0_web', 'index.html'), 'utf8');
const leaked = ['〔시험용', '시험용 대사', '__cw', '디버그 메뉴', '__CW_DEBUG__', 'debugmenu', 'dbgstate', '씬 점프', 'jumpToScene', 'buildProgress', 'installJump', 'SCENE_STEPS', 'dbgt'].filter((m) => html.includes(m));

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors: string[] = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
page.on('requestfailed', (r) => errors.push(`requestfailed ${r.url()}`));
await page.goto(url);
await page.waitForFunction(() => (window as any).__game?.scene.getScene('Explore')?.player, null, { timeout: 10000 });
await page.waitForSelector('#title'); // 타이틀 → 새 게임
await page.keyboard.press('Enter');
await page.waitForSelector('#title', { state: 'detached' });
// 새 게임: 이름 입력(기본 이름) → 근접 조사(Esc) → 오프닝 연출을 Enter 로 끝까지
await page.waitForSelector('#namepopup'); await page.keyboard.press('Enter');
await page.waitForSelector('#closeup'); await page.keyboard.press('Escape');
const scene = () => page.evaluate(() => { const s = (window as any).__game.scene.getScene('Explore'); return s.locked || !s.started; });
for (let i = 0; i < 400 && (await scene()); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(120); }
const px = () => page.evaluate(() => (window as any).__game.scene.getScene('Explore').player.x as number);
const x0 = await px();
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(600);
await page.keyboard.up('ArrowRight');
const x1 = await px();
// 제출 빌드에서도 타이틀·최종 보고서·엔딩 UI 코드가 들어 있고 시험 훅은 없어야 한다
const hook = await page.evaluate(() => typeof (window as any).__cw);
const canvas = await page.evaluate(() => { const c = document.querySelector('canvas'); return c ? [c.width, c.height] : null; });
await browser.close();

const fail: string[] = [];
if (leaked.length) fail.push(`테스트 전용 내용이 제출 빌드에 포함됨: ${leaked.join(', ')}`);
if (errors.length) fail.push(`콘솔 오류 ${errors.length}건: ${errors.join(' | ')}`);
if (!canvas || canvas[0] !== 480 || canvas[1] !== 270) fail.push(`캔버스 이상: ${canvas}`);
if (hook !== 'undefined') fail.push('시험 훅(__cw) 이 제출 빌드에 노출됨');
if (!(x1 > x0)) fail.push(`이동 안 됨: ${x0} → ${x1}`);
if (fail.length) { console.error('FAIL\n' + fail.join('\n')); process.exit(1); }
console.log(`OK file:// 콘솔 오류 0, 캔버스 ${canvas}, x ${x0.toFixed(1)} → ${x1.toFixed(1)}`);
