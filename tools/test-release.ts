// zip을 임시 폴더에 풀어 file:// 로 열고 자동 확인
import AdmZip from 'adm-zip';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
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
// 개발 도구(ffmpeg-static)는 제출물에 들어가지 않는다: 어떤 파일 이름·내용에도 없어야 한다
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const root = join(dir, 'ConfessionWard_v1.0_web');
const toolFiles = walk(root).filter((f) => /ffmpeg|ffprobe/i.test(f));
const audioFiles = existsSync(join(root, 'assets', 'audio')) ? walk(join(root, 'assets', 'audio')).map((f) => f.slice(root.length + 1).split(sep).join('/')) : [];
const leaked = ['ffmpeg-static', 'cw_playlog', 'initPlayLog', '플레이 기록', '〔시험용', '시험용 대사', '__cw', '디버그 메뉴', '__CW_DEBUG__', 'debugmenu', 'dbgstate', '씬 점프', 'jumpToScene', 'buildProgress', 'installJump', 'SCENE_STEPS', 'dbgt'].filter((m) => html.includes(m));

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors: string[] = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
// 곡을 바꿀 때 아직 받는 중인 소리 파일의 로드가 취소(ERR_ABORTED)되는 것은 정상이다. 그 밖의 요청 실패는 오류.
page.on('requestfailed', (r) => { if (!(/\.(mp3|ogg|wav|webp)$/.test(r.url()) && /ABORTED/.test(r.failure()?.errorText ?? ''))) errors.push(`requestfailed ${r.url()}`); });
await page.goto(url);
await page.waitForFunction(() => (window as any).__game?.scene.getScene('Explore')?.player, null, { timeout: 10000 });
await page.waitForSelector('#title'); // 타이틀 → (소리) 설정·정보 화면을 지나 새 게임
const hintBefore = await page.locator('#title .anykey').count(); // 첫 입력 전에는 "아무 키나 눌러 시작" 안내
for (const k of ['ArrowDown', 'ArrowDown']) await page.keyboard.press(k); // 새 게임 → 조작법 → 설정 (이어하기는 저장이 없어 없다)
await page.keyboard.press('Enter'); await page.waitForTimeout(100);
const settingsText = await page.locator('#title').innerText();
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowLeft'); // 음량 조절
await page.keyboard.press('Escape');
await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(100); // 정보
const infoText = await page.locator('#title').innerText();
await page.keyboard.press('Escape');
const hintAfter = await page.locator('#title .anykey').count();
await page.keyboard.press('m'); await page.keyboard.press('m'); // 전체 음소거 두 번 (켬 → 끔)
const audioSaved = await page.evaluate(() => { try { return localStorage.getItem('cw_audio'); } catch { return 'blocked'; } });
for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp'); // 정보 → 새 게임
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
// 들어 있는 소리 파일(MP3·OGG·WAV)을 이 브라우저가 file:// 에서 읽고 길이를 알아내는지 확인
const audioBad = await page.evaluate(async (files: string[]) => {
  const bad: string[] = [];
  for (const f of files) {
    const ok = await new Promise<boolean>((res) => { const a = new Audio(f); a.addEventListener('loadedmetadata', () => res(a.duration > 0)); a.addEventListener('error', () => res(false)); setTimeout(() => res(false), 8000); });
    if (!ok) bad.push(f);
  }
  return bad;
}, audioFiles);
const hook = await page.evaluate(() => typeof (window as any).__cw);
const canvas = await page.evaluate(() => { const c = document.querySelector('canvas'); return c ? [c.width, c.height] : null; });
await browser.close();

const fail: string[] = [];
if (leaked.length) fail.push(`테스트 전용 내용이 제출 빌드에 포함됨: ${leaked.join(', ')}`);
if (errors.length) fail.push(`콘솔 오류 ${errors.length}건: ${errors.join(' | ')}`);
if (!canvas || canvas[0] !== 480 || canvas[1] !== 270) fail.push(`캔버스 이상: ${canvas}`);
if (hook !== 'undefined') fail.push('시험 훅(__cw) 이 제출 빌드에 노출됨');
if (toolFiles.length) fail.push(`개발 도구 파일이 제출물에 있음: ${toolFiles.join(', ')}`);
if (audioBad.length) fail.push(`브라우저가 못 읽는 소리 파일: ${audioBad.join(', ')}`);
if (hintBefore !== 1 || hintAfter !== 0) fail.push(`"아무 키나 눌러 시작" 안내 이상: 입력 전 ${hintBefore}, 입력 후 ${hintAfter}`);
if (!settingsText.includes('마스터 음량') || !infoText.includes('배경음악')) fail.push('설정/정보 화면이 열리지 않음');
if (audioSaved === 'blocked') console.warn('! file:// 에서 localStorage 가 막혀 있다 (음량은 저장되지 않지만 소리 동작에는 문제 없다)');
if (!(x1 > x0)) fail.push(`이동 안 됨: ${x0} → ${x1}`);
if (fail.length) { console.error('FAIL\n' + fail.join('\n')); process.exit(1); }
console.log(`OK 소리 파일 ${audioFiles.length}개 재생 가능, 개발 도구 파일 0 · file:// 콘솔 오류 0, 캔버스 ${canvas}, x ${x0.toFixed(1)} → ${x1.toFixed(1)}`);
