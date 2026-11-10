// e2e: 테스트 전용 대사를 포함한 file:// 빌드(mode=e2e)를 열어 사무실→1층→2층→3층→1층→지하 이동, 대화, 수첩 결론 저장을 검증한다.
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';

execSync('npx vite build --mode e2e', { stdio: 'inherit' });
const url = pathToFileURL(resolve('.tmp/e2e/index.html')).href;
const SHOT = process.env.SHOTS === '1';
mkdirSync('docs/screenshots', { recursive: true });

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors: string[] = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
page.on('requestfailed', (r) => errors.push(`requestfailed ${r.url()}`));

const fails: string[] = [];
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails.push(msg); };
const cw = <T>(fn: string): Promise<T> => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`) as Promise<T>;
const press = async (k: string, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(k); };
const area = () => cw<string>('cw.scene.areaId');
const teleport = (x: number) => cw(`cw.scene.teleportX(${x})`);
const promptText = async () => ((await page.locator('#prompt:not(.hidden)').count()) ? (await page.locator('#prompt').innerText()).replace(/\s+/g, ' ') : '');
const wait = (ms: number) => page.waitForTimeout(ms);
const shot = async (name: string) => { if (SHOT) await page.screenshot({ path: `docs/screenshots/${name}.png` }); };
async function enterArea(x: number, expect: string) {
  await teleport(x); await wait(60);
  await press('Enter');
  await page.waitForFunction((a) => (window as any).__cw.scene.areaId === a && !(window as any).__cw.scene.busy, expect, { timeout: 3000 });
}

await page.goto(url);
await page.waitForFunction(() => (window as any).__cw?.scene?.player, null, { timeout: 10000 });
check((await area()) === 'office', '시작 구역은 사무실');

// ---- 근접 조사 (책상) ----
await teleport(67.5); await wait(60);
check((await promptText()).includes('조사하기'), '책상 앞에서 "조사하기" 프롬프트');
await press('Enter');
await page.waitForSelector('#closeup');
await page.locator('.hot').first().hover();
check(await page.locator('.hot').first().locator('.hl').isVisible(), '마우스 호버 시 이름표 하이라이트');
await shot('stage3_closeup');
await press('ArrowRight'); await press('Enter');
check(await page.locator('#closeup-detail').isVisible(), '키보드로 확대 보기 (←→ Enter)');
await press('Escape'); await press('Escape');
check((await page.locator('#closeup').count()) === 0, 'Esc 로 근접 조사 종료');

// ---- 대화 (박은호) ----
await teleport(11 * 45 - 25); await wait(60);
check((await promptText()).includes('대화하기'), '박은호 앞에서 "대화하기" 프롬프트');
await press('Enter');
await page.waitForSelector('#dialogue');
await wait(60); await press('Enter'); // 타이핑 즉시 완성
await press('Enter'); // 다음 노드 (n2: 선택지)
await wait(60); await press('Enter');
check((await page.locator('#dialogue .opt').count()) === 2, '선택지 2개 표시');
await shot('stage3_dialogue');
await press('ArrowDown'); await press('ArrowUp'); await press('1'); // 숫자키로 선택 → n3
await wait(60); await press('Enter'); // 타이핑 완성
await press('Enter'); // 대화 끝
check((await page.locator('#dialogue').count()) === 0, '대화 종료');
check(await cw<boolean>("cw.state.flags.includes('intro_done') && cw.state.evidenceIds.includes('E01_last_letter')"), '대화로 단서(E01)·플래그(intro_done) 획득');

// ---- 사무실 → 1층 ----
await enterArea(12 * 45, 'floor1');
check(true, '사무실 → 1층');
// 걸어서 백선우 자동 트리거 (Shift 달리기)
await cw("(cw.state.evidenceIds.push('E03_preliminary_exam'), cw.state.verifiedEvidenceIds.push('E03_preliminary_exam'))");
await page.keyboard.down('Shift'); await page.keyboard.down('ArrowRight');
await page.waitForSelector('#dialogue', { timeout: 5000 });
await page.keyboard.up('ArrowRight'); await page.keyboard.up('Shift');
check(true, '백선우 앞을 지나가면 자동으로 대화 시작');
await wait(60); await press('Enter'); // 타이핑 완성
await press('ArrowDown'); await press('Enter'); // [단서 제시]
await press('Space'); // 첫 번째 자료(E01) 선택
await press('Enter');
await wait(30);
check((await page.locator('#dialogue .msg').innerText()).includes('직접 충돌하지 않는다'), '관련 없는 단서 제시: 중립 메시지만');
await press('Enter'); // 선택이 [단서 제시]에 남아 있으므로 바로 다시 열기
await press('ArrowDown'); await press('Space'); await press('Enter'); // E03 제시 → 모순 → 한지수 노드
await wait(60); await press('Enter'); await press('Enter'); // 한지수 노드 → b_rev (수정 진술)
await wait(60); await press('Enter');
check(await cw<boolean>("cw.state.statements.baek_s1?.stage === 'revised'"), '진술 3단계: 미확인 → 모순 → 수정');
await press('Enter'); // 대화 끝
await page.waitForFunction(() => !document.querySelector('#dialogue'));

// ---- 1층 → 2층 → 3층 → 2층 → 1층 → 지하 ----
await enterArea(36 * 45, 'floor2'); check(true, '1층 → 2층');
await enterArea(30 * 45, 'floor3'); check(true, '2층 → 3층');
await enterArea(0, 'floor2'); check(true, '3층 → 2층');
await enterArea(0, 'floor1'); check(true, '2층 → 1층');
await teleport(32 * 45); await wait(60);
check((await promptText()) === '', '지하 계단은 잠겨 있어 프롬프트가 없다');
await cw("cw.state.solvedPuzzleIds.push('P03_revision_diff', 'P04_approval_chain')");
await wait(60);
check((await promptText()).includes('지하로 내려가기'), 'P03·P04 해결 후 지하 계단 프롬프트');
await press('Enter');
await page.waitForFunction(() => (window as any).__cw.scene.areaId === 'b1' && !(window as any).__cw.scene.busy);
check((await area()) === 'b1', '1층 → 지하');

// ---- 사건 수첩 (키보드만) ----
await cw(`(cw.state.evidenceIds.splice(0, 99, 'E01_last_letter', 'E02_altar_blood', 'E03_preliminary_exam', 'E07_report_revision'),
  cw.state.verifiedEvidenceIds.splice(0, 99, 'E01_last_letter', 'E02_altar_blood', 'E03_preliminary_exam', 'E07_report_revision'),
  cw.state.flags.push('flag_scene_rebuilt'))`);
await press('Tab');
await page.waitForSelector('#notebook');
check((await page.locator('#notebook .nlist .row').count()) === 4, '수첩 단서 목록 4개');
await shot('stage3_notebook_evidence');
await press('ArrowRight', 2); // 질문 A
await press('ArrowDown', 2); await press('Enter'); // 가설 3 선택
await press('ArrowDown'); await press('Enter'); // 지지 근거 1 → 선택기
await press('ArrowDown'); await press('Enter'); // E01(맥락) → 거절
check((await page.locator('#nbmsg').innerText()).includes('맥락 단서'), '맥락 단서는 근거 슬롯에 넣을 수 없다');
await press('Enter'); await press('ArrowDown', 2); await press('Enter'); // E02
await press('ArrowDown'); await press('Enter'); await press('ArrowDown', 3); await press('Enter'); // 지지 2: E03
await press('ArrowDown', 3); await press('Enter'); // 저장 시도 (반박 비어 있음)
check(await cw<boolean>('cw.state.selectedHypothesisByClaim.claim_a === undefined'), '반박 슬롯이 비면 저장되지 않는다');
await press('ArrowUp', 2); await press('Enter'); await press('ArrowDown', 4); await press('Enter'); // 반박: E07
await press('ArrowDown', 2); await press('Enter'); // 결론 저장
check(await cw<boolean>("cw.state.selectedHypothesisByClaim.claim_a === 'a3_collision' && cw.state.submittedRebuttalByClaim.claim_a[0] === 'E07_report_revision'"), '수첩에서 키보드로 결론 저장');
const nb = await page.locator('#notebook').innerText();
check(!/정답|오답|맞았|틀렸/.test(nb), '저장 후 정답 여부를 표시하지 않는다');
await shot('stage3_notebook');
await press('Tab');
check((await page.locator('#notebook').count()) === 0, 'Tab 으로 수첩 닫기');

await browser.close();
check(errors.length === 0, `콘솔 오류 0 ${errors.join(' | ')}`);
if (fails.length) { console.error(`\nFAIL ${fails.length}건`); process.exit(1); }
console.log('\nE2E OK');
