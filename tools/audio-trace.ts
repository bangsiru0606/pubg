// 장면별 소리 재생 확인: 오디오 관리자의 재생 기록(audioTrace)을 장면마다 읽어 표로 낸다. 시험 빌드(vite build --mode e2e)와 실제 파일을 쓴다.
//   npx tsx tools/audio-trace.ts      (public/assets/audio 에 소리 파일이 있어야 한다: npm run assets)
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';

execSync('npx vite build --mode e2e', { stdio: 'ignore' });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors: string[] = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
page.on('requestfailed', (r) => { if (!(/\.(mp3|ogg|wav)$/.test(r.url()) && /ABORTED/.test(r.failure()?.errorText ?? ''))) errors.push(`requestfailed ${r.url()}`); });
const cw = <T>(fn: string) => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`) as Promise<T>;
const wait = (ms: number) => page.waitForTimeout(ms);
const press = async (k: string, n = 1, gap = 60) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await wait(gap); } };
const rows: [string, string, string][] = [];
const note = async (label: string) => {
  const t = await cw<string[]>('cw.audioTrace(true)');
  const bgm = t.filter((x) => x.startsWith('BGM')).map((x) => x.slice(4).trim()), sfx = new Map<string, number>();
  for (const x of t.filter((y) => y.startsWith('SFX'))) { const k = `${x.slice(4).split('→')[0]}→${x.split('→')[1].split(' ')[0]}`; sfx.set(k, (sfx.get(k) ?? 0) + 1); }
  rows.push([label, bgm.join(' → ') || '(변화 없음)', [...sfx].map(([k, n]) => (n > 1 ? `${k}×${n}` : k)).join(', ') || '(없음)']);
};
interface AState { unlocked: boolean; base: string | null; stack: [string, string][]; bgm: { name: string; target: number; volume: number; t: number; dur: number }[]; vol: Record<string, number> }
const state = () => cw<AState>('cw.audioState()');
const bgmVol = async () => (await state()).bgm.find((c) => c.target === 1)?.volume ?? 0;

await page.goto(pathToFileURL(resolve('.tmp/e2e/index.html')).href);
await page.waitForFunction(() => (window as any).__cw?.scene?.player); await page.waitForSelector('#title'); await wait(500);
await note('타이틀 (키 입력 전)');
await press('ArrowDown'); await wait(800); await note('타이틀 첫 키 입력');
await press('ArrowUp'); await press('Enter'); await page.waitForSelector('#namepopup'); await wait(300); await note('새 게임 선택 → 이름 입력');
await press('Enter'); await page.waitForSelector('#closeup'); await wait(300); await note('이름 확정 → 책상 근접 조사');
await press('Escape'); await wait(300);
// 오프닝(노크 → 박은호 입장 → 대화 → 편지)을 Enter 로 진행
const done = () => cw<boolean>('!(cw.scene.locked || !cw.scene.started)');
for (let i = 0; i < 400 && !(await done()); i++) { await press('Enter', 1, 120); if (i === 12) await note('오프닝 앞부분 (노크·박은호 입장·대화)'); }
await note('오프닝 뒤부분 (편지·진행)');
await cw('cw.scene.teleportX(540)'); await wait(100); await press('Enter'); await wait(500); await note('사무실 문 → 1층 컷신');
await press('Enter'); await wait(1800); await note('컷신 건너뛰기 → 1층 도착');
await cw("cw.state.flags.push('trigger_fired:floor1:baek')");
await cw("cw.openDialogue('baek_lobby')"); await wait(800); await note('1층 백선우 심문 대화 시작');
for (let i = 0; i < 20 && (await page.locator('#dialogue').count()); i++) await press('Enter', 1, 200);
await wait(2000); await note('대화 종료 → 구역 BGM 복귀');
await cw("cw.state.flags.push('baek_left')"); await cw('cw.scene.refresh()'); await wait(300);
await cw('cw.scene.teleportX(690)'); await wait(100); await press('Enter'); await wait(500); await note('1층 바닥 서류 조사 (단서 획득 + 원문)');
await press('Enter'); await wait(300);
await cw('cw.scene.go("room_director", 100)'); await wait(1200); await cw('cw.scene.teleportX(630)'); await wait(100); await cw('cw.audioTrace(true)');
await press('Enter'); await wait(1500); for (let i = 0; i < 6; i++) await press('Enter', 1, 250); await wait(300); await note('원장실 책상 아래 (독백 + 단서 획득)');
await cw('cw.scene.go("floor1", 1620)'); await wait(1200); await cw('cw.audioTrace(true)');
await cw("cw.ui.acquire(['E02_altar_blood','E03_preliminary_exam','E04_wristband_fragment'])"); await cw("cw.ui.puzzle('P01_scene_rebuild')"); await wait(1500); await note('퍼즐 P01 열기');
const click = (sel: string) => page.locator(sel).first().click();
await click('#puzzle [data-token="impactPosition"]'); await click('#puzzle [data-zone="desk_side"]'); await click('#puzzle [data-token="finalPosition"]'); await click('#puzzle [data-zone="desk_chair"]');
await click('#puzzle [data-chip="movedObjects|body"]'); await click('#puzzle [data-chip="movedObjects|chair"]');
await cw('cw.audioTrace(true)'); await click('#puzzle [data-submit]'); await wait(300); await note('퍼즐 [확인] 오답 1회');
await click('#puzzle [data-submit]'); await wait(900); await note('퍼즐 [확인] 오답 2회 (힌트 1단계)');
await click('#puzzle [data-token="impactPosition"]'); await click('#puzzle [data-zone="altar_floor"]'); await click('#puzzle [data-submit]'); await wait(500); await note('퍼즐 [확인] 정답');
await press('Escape'); await wait(1800); await note('퍼즐 닫기 → 구역 BGM 복귀');
await cw('cw.scene.teleportX(1620)'); await wait(100); await press('Enter'); await wait(1500); await note('1층 → 2층 계단');
await cw('cw.scene.go("b1", 100)'); await wait(2200); await note('지하 도착 (직접 이동)');
await cw("cw.openDialogue('jeong_haneul_final')"); await wait(2500); await note('정하늘 고백 대화 시작');
for (let i = 0; i < 30 && (await page.locator('#dialogue').count()); i++) await press('Enter', 1, 250);
await wait(800); await note('정하늘 고백 진행·종료');
await cw("cw.openDialogue('eunho_message')"); await wait(2500); await note('증거 보존 선택 대화 시작');
for (let i = 0; i < 6; i++) await press('Enter', 1, 300);
await wait(500); await note('선택 [A] 증거 전송');
for (let i = 0; i < 20 && (await page.locator('#dialogue').count()); i++) await press('Enter', 1, 250);
await wait(2500); await note('선택 대화 종료 → 최종 보고서');
await cw('cw.ui.conclude(true)'); await cw('cw.ui.ending()'); await wait(2500); await note('엔딩 (현재 상태의 결과)');
await press('Escape'); await wait(300);
await cw('cw.scene.jumpToScene(7)'); await wait(1500); await note('씬 7 점프 → 최종 보고서');
await cw('cw.ui.conclude(true)'); await cw('cw.ui.ending()'); await wait(2500); await note('엔딩 A (질문 A~D 모두 맞게 저장)');
await press('Escape'); await wait(300);
console.log('| 지점 | BGM 변화 | 효과음 |\n|---|---|---|');
for (const [a, b, c] of rows) console.log(`| ${a} | ${b} | ${c} |`);
// 음량·음소거 확인
await cw("cw.scene.go('floor1', 300)"); await wait(2500);
const v1 = await bgmVol();
await page.keyboard.press('m'); await wait(300); const v2 = await bgmVol(); const m2 = (await state()).vol.muted;
await page.keyboard.press('m'); await wait(300); const v3 = await bgmVol();
console.log(`\nM 음소거: BGM 음량 ${v1} → ${v2} (muted=${m2}) → ${v3}`);
await cw('cw.scene.openTitle()'); await wait(300);
await press('ArrowDown', 3); await press('Enter'); await wait(200); // 새 게임·이어하기·조작법 다음의 "설정"
await press('ArrowDown'); await press('ArrowLeft', 4); await wait(400); const v4 = await bgmVol(); const st = (await state()).vol;
console.log(`설정 배경음 슬라이더 -40%: BGM 음량 ${v3} → ${v4} (배경음 ${st.bgm}, 효과음 ${st.sfx})`);
await press('ArrowDown'); await press('ArrowLeft', 3); await wait(200); await cw('cw.audioTrace(true)');
await cw("cw.sfx('onUiConfirm')"); const tr2 = await cw<string[]>('cw.audioTrace(true)');
console.log(`설정 효과음 슬라이더 -30%: 효과음 ${(await state()).vol.sfx} → ui_confirm 재생 음량 ${tr2[0]?.split('@')[1]} (마스터 ${(await state()).vol.master} × 효과음 ${(await state()).vol.sfx})`);
await browser.close();
if (errors.length) { console.error('오류:', errors); process.exit(1); }
console.log('콘솔 오류 0');
