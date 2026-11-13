// e2e: 테스트 전용 대사를 포함한 file:// 빌드(mode=e2e)를 열어 검증한다.
//  A. 시스템 시험 (테스트 전용 대사): 근접 조사, 선택지, 단서 제시, 진술 3단계, 층 이동, 사건 수첩
//  B. 이야기 시험 (새 게임, 실제 대사): 씬 1 → 씬 2 → P01 → 2층 계단 개방
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';
import { confirm, dismissRule, placeCorrect, runDesktopCompare } from './puzzle-driver';

execSync('npx vite build --mode e2e', { stdio: 'inherit' });
const url = pathToFileURL(resolve('.tmp/e2e/index.html')).href;
const SHOT = process.env.SHOTS === '1';
mkdirSync('docs/screenshots', { recursive: true });

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors: string[] = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
// 곡을 바꿀 때 아직 받는 중인 소리 파일의 로드가 취소(ERR_ABORTED)되는 것은 정상이다. 그 밖의 요청 실패는 오류.
page.on('requestfailed', (r) => { if (!(/\.(mp3|ogg|wav|webp)$/.test(r.url()) && /ABORTED/.test(r.failure()?.errorText ?? ''))) errors.push(`requestfailed ${r.url()}`); });

const fails: string[] = [];
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails.push(msg); };
const cw = <T>(fn: string): Promise<T> => page.evaluate(`(() => { const cw = window.__cw; return ${fn}; })()`) as Promise<T>;
const press = async (k: string, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(k); };
const area = () => cw<string>('cw.scene.areaId');
const teleport = (x: number) => cw(`cw.scene.teleportX(${x})`);
const promptText = async () => ((await page.locator('#prompt:not(.hidden)').count()) ? (await page.locator('#prompt').innerText()).replace(/\s+/g, ' ') : '');
const wait = (ms: number) => page.waitForTimeout(ms);
const confirmPick = async () => { for (let i = 0; i < 20 && !(await page.locator('#dialogue .opt.sel').innerText()).includes('제시하기'); i++) await press('ArrowDown'); await press('Enter'); }; // 선택기: [제시하기] 행에서 Enter
const click = (sel: string) => page.locator(sel).first().click();
/** 퍼즐 오답 문장(줄 단위): 한 번에 하나만 나와야 한다 */
const warnLines = async () => (await page.locator('#puzzle .warn').innerText()).split('\n').map((l) => l.trim()).filter(Boolean);
const shot = async (name: string) => { if (SHOT) await page.screenshot({ path: `docs/screenshots/${name}.png` }); };
// 화면 텍스트에 내부 ID(영문 snake_case, E01 같은 단서 코드, 플래그 이름)가 나오면 안 된다
const ID_RE = /[a-z]+(?:_[a-z0-9]+)+|\bE\d{2}\b|\bP0\d\b|flag_|trigger_fired|puzzle_opened|cutscene_done/;
const noIds = async (where: string) => {
  const t = await page.locator('#ui').innerText();
  const m = t.match(ID_RE);
  check(!m, `${where}: 내부 ID 노출 없음${m ? ' → ' + m[0] : ''}`);
};
const startQuick = async () => { await page.waitForSelector('#title'); await cw('cw.quick()'); await cw("cw.state.flags.push('trigger_fired:floor1:baek')"); /* 시스템 시험은 1층 첫 입장 연출(stage) 없이 */ await page.waitForSelector('#title', { state: 'detached' }); }; // 시스템 시험·분기 시험: 오프닝 없이 시작
async function enterArea(x: number, expect: string) {
  await teleport(x); await wait(60);
  await press('Enter');
  await page.waitForFunction((a) => (window as any).__cw.scene.areaId === a && !(window as any).__cw.scene.busy, expect, { timeout: 3000 });
}

await page.goto(url);
await page.waitForFunction(() => (window as any).__cw?.scene?.player, null, { timeout: 10000 });
await startQuick();
check((await area()) === 'office', '시작 구역은 사무실');

// =====================================================================
// A. 시스템 시험 (테스트 전용 대사)
// =====================================================================
await teleport(67.5); await wait(60);
check((await promptText()).includes('조사하기'), '책상 앞에서 "조사하기" 프롬프트');
await press('Enter');
await page.waitForSelector('#closeup');
await page.locator('.hot').first().hover();
check(await page.locator('.hot').first().locator('.hl').isVisible(), '마우스 호버 시 이름표 하이라이트');
await shot('stage3_closeup');
await press('ArrowRight'); await press('ArrowRight'); await press('Enter'); // 선택 없음 → 모자 → 캘린더
check(await page.locator('#closeup-detail').isVisible(), '키보드로 확대 보기 (←→ Enter)');
check((await page.locator('#closeup-detail .dbody').innerText()).includes('8월 17일'), '확대 보기: 설명은 오른쪽 칸');
await press('Enter'); await press('Escape'); // 상세 닫기 → 근접 조사 닫기
check((await page.locator('#closeup').count()) === 0, 'Esc 로 근접 조사 종료');

await cw("cw.openDialogue('test_eunho_intro')");
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
check(await cw<boolean>("cw.state.flags.includes('intro_done') && cw.state.evidenceIds.includes('E01_last_letter')"), '대화로 단서·플래그 획득');
await cw("cw.state.flags.push('cutscene_done:hospital_intro', 'flag_scene_rebuilt', 'flag_night_timeline')"); // 이동 시험용: 컷신·계단 잠금은 B 에서 확인

await enterArea(12 * 45, 'floor1');
check(true, '사무실 → 1층');
await cw("(cw.state.evidenceIds.push('E03_preliminary_exam'), cw.state.verifiedEvidenceIds.push('E03_preliminary_exam'), cw.openDialogue('test_baek_lobby'))");
await page.waitForSelector('#dialogue');
await wait(60); await press('Enter'); // 타이핑 완성
await press('ArrowDown'); await press('Enter'); // [단서 제시]
await press('Space'); // 첫 번째 자료(E01) 선택
await confirmPick();
await wait(30);
check((await page.locator('#dialogue .msg').innerText()).includes('직접 충돌하지 않는다'), '관련 없는 단서 제시: 중립 메시지만');
await press('Enter'); // 선택이 [단서 제시]에 남아 있으므로 바로 다시 열기
await press('ArrowDown'); await press('Enter'); await confirmPick(); // E03 제시 (Enter 로도 선택된다) → 모순 → 한지수 노드
await wait(60); await press('Enter'); await press('Enter'); // 한지수 노드 → b_rev (수정 진술)
await wait(60); await press('Enter');
check(await cw<boolean>("cw.state.statements.baek_s1?.stage === 'revised'"), '진술 3단계: 미확인 → 모순 → 수정');
await press('Enter'); // 대화 끝
await page.waitForFunction(() => !document.querySelector('#dialogue'));

await cw("cw.state.evidenceIds.push('E04_wristband_fragment')"); // 1층 → 2층 조건: 손목띠(E04)
await enterArea(36 * 45, 'floor2'); check(true, '1층 → 2층');
await cw("cw.state.flags.push('haneul_met', 'floor3_reason')"); // 2층 → 3층 조건: 정하늘 대면 + 채소연의 3층 이야기
await enterArea(30 * 45, 'floor3'); check(true, '2층 → 3층');
await enterArea(0, 'floor2'); check(true, '3층 → 2층');
await enterArea(0, 'floor1'); check(true, '2층 → 1층');
await teleport(32 * 45); await wait(60);
check((await promptText()).includes('지하로 내려가기'), '지하 철창문은 잠겨 있어도 반응한다 (프롬프트)');
await press('Enter'); await page.waitForSelector('#dialogue'); await wait(60); await press('Enter');
check((await page.locator('#dialogue .text').innerText()) === '(철창문이 잠겨 있다. 열쇠가 필요하다. 이런 열쇠는 보통 간호를 총괄하는 사람이 맡는다.)' && (await area()) === 'floor1', '지하 철창문 잠김 독백 (괄호 표시, 이동하지 않는다)');
await press('Enter'); await page.waitForFunction(() => !document.querySelector('#dialogue'));
await cw("cw.state.flags.push('basement_key')"); // 오미란의 열쇠
await wait(60);
check((await promptText()).includes('지하로 내려가기'), '열쇠를 받은 뒤 지하 계단 프롬프트');
await press('Enter');
// 지하 첫 입장: 컷신(그림은 배치 8 전까지 대체 배경) + 독백 3줄 → 지하 (한 번만)
await page.waitForSelector('#cutscene'); await page.waitForFunction(() => document.querySelector('#dialogue .text')?.textContent?.includes('차가운 공기가 올라온다.'));
check((await page.locator('#cutscene .cutph').count()) === 1 || (await page.locator('#cutscene img').count()) === 1, '[지하 첫 입장] 컷신 그림(또는 pending 대체 배경) + 독백');
for (let i = 0; i < 14 && (await area()) !== 'b1'; i++) { await wait(180); await press('Enter'); }
await page.waitForFunction(() => (window as any).__cw.scene.areaId === 'b1' && !(window as any).__cw.scene.busy);
check((await area()) === 'b1' && await cw<boolean>("cw.state.flags.includes('cutscene_done:basement_intro')"), '1층 → 지하 (첫 입장 컷신을 본 뒤)');

await cw(`(cw.state.evidenceIds.splice(0, 99, 'E01_last_letter', 'E02_altar_blood', 'E03_preliminary_exam', 'E07_report_revision'),
  cw.state.verifiedEvidenceIds.splice(0, 99, 'E01_last_letter', 'E02_altar_blood', 'E03_preliminary_exam', 'E07_report_revision'),
  cw.state.flags.push('flag_scene_rebuilt'))`);
await press('Tab');
await page.waitForSelector('#notebook');
await noIds('수첩 단서 목록');
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
await noIds('수첩 질문');
await shot('stage3_notebook');
await press('Tab');
check((await page.locator('#notebook').count()) === 0, 'Tab 으로 수첩 닫기');

// =====================================================================
// B. 이야기 시험 (새 게임, 실제 대사): 씬 1 → 씬 2 → P01 → 2층 계단 개방
// =====================================================================
const NAME = '서윤'; // 기본 이름(한지수)과 다른 이름: 화면에 기본 이름이 남으면 안 된다
await page.evaluate(() => { try { localStorage.clear(); } catch { /* 무시 */ } }); // 앞 시험의 저장을 지워 "저장 없음" 상태에서 시작한다
await page.goto(url);
await page.waitForFunction(() => (window as any).__cw?.scene?.player, null, { timeout: 10000 });
const noDefault = async (where: string) => { const t = await page.locator('#ui').innerText(); check(!t.includes('한지수'), `${where}: 기본 이름 “한지수” 가 남아 있지 않다`); };
const mash = async () => { for (let i = 0; i < 80; i++) { if (!(await page.locator('#dialogue').count())) return; await press('Enter'); await wait(30); } };
const docText = async () => (await page.locator('#viewer').innerText()).replace(/\s+/g, ' ');
const closeViewer = async () => { await press('Enter'); await page.waitForFunction(() => !document.querySelector('#viewer')); };

// ---- 타이틀 → 이름 입력 ----
await page.waitForSelector('#title');
await shot('stage7_fix_title');
check((await page.locator('#title .opt.dis').count()) === 1 && (await page.locator('#title .opt.dis').innerText()) === '이어하기', '[타이틀] 저장이 없으면 이어하기는 회색이다');
check((await page.locator('#title .opt', { hasText: '전체화면' }).count()) === 1 && (await page.locator('#title .opt', { hasText: 'F11' }).count()) === 1, '[타이틀] 전체화면 항목 (F11 안내)');
await press('ArrowDown'); await wait(50);
check((await page.locator('#title .opt.sel').innerText()) === '조작법', '[타이틀] ↓ 는 회색 이어하기를 건너뛴다');
await press('ArrowUp'); await wait(50);
check((await page.locator('#title .opt.sel').innerText()) === '새 게임', '[타이틀] ↑ 도 건너뛴다');
await page.locator('#title .opt.dis').click({ force: true }); await wait(80);
check((await page.locator('#title').count()) === 1, '[타이틀] 회색 이어하기는 눌러도 시작되지 않는다');
await press('Enter'); // 새 게임
await page.waitForSelector('#namepopup');
await page.waitForFunction(() => document.activeElement?.id === 'nameinput', null, { timeout: 2000 }); // 이름 입력창은 열리자마자 포커스를 가진다 (첫 글자를 잃지 않는다)
const inp = page.locator('#nameinput');
check((await inp.getAttribute('placeholder')) === 'ex. 한지수', '[이름] 안내 문구 “ex. 한지수”');
await shot('stage7_fix_name');
// 입력 중에는 게임 키가 동작하지 않는다 (A/D, 방향키, Tab, 스페이스)
const x00 = await cw<number>('cw.scene.player.x');
await page.keyboard.type('ad d'); await press('ArrowRight'); await press('ArrowLeft'); await press('Tab');
check((await inp.inputValue()) === 'ad d', '[이름] 입력창에 글자와 스페이스가 그대로 들어간다');
check((await page.locator('#notebook').count()) === 0 && (await cw<number>('cw.scene.player.x')) === x00, '[이름] 입력 중 A/D·방향키·Tab 이 게임에 전달되지 않는다');
await inp.fill('');
await page.keyboard.type('가나다라마바사아자차');
check((await inp.inputValue()).length === 8, '[이름] 8자까지만 입력된다');
// 한글 입력(IME) 조합 중의 Enter 는 확정이 아니다
await inp.evaluate((el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229, bubbles: true, cancelable: true })));
await wait(80);
check((await page.locator('#namepopup').count()) === 1, '[이름] IME 조합 중 Enter 로는 확정되지 않는다');
await inp.fill('  ' + NAME + '  ');
await press('Enter');

// ---- 오프닝: 책상 근접 조사 ----
await page.waitForSelector('#closeup', { timeout: 3000 });
check((await cw<string>('cw.state.playerName')) === NAME, '[이름] 앞뒤 공백을 지운 이름이 저장된다');
check((await page.locator('#closeup .title').innerText()).includes('출근한 아침, 책상을 살펴본다 (마우스로 조사)'), '[오프닝] 근접 조사 안내 문구');
check((await page.locator('#closeup .hot').count()) === 3, '[오프닝] 소품은 모자·캘린더·신문 (신문은 그림이 오기 전까지 종이 모양 대체 표시)');
const hat = page.locator('#closeup .hot').first();
const hb = (await hat.boundingBox())!;
const bright = (loc: typeof hat) => loc.locator('img').evaluate((el) => getComputedStyle(el).filter);
check((await bright(hat)).includes('0.8'), '[근접 조사] 평소에는 소품이 밝기 80%');
await page.mouse.move(hb.x + 2, hb.y + 2); // 투명 모서리: 반응하지 않는다
await wait(60);
check(!(await hat.evaluate((el) => el.classList.contains('on'))), '[근접 조사] 그림이 없는 여백에서는 반응하지 않는다');
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
await wait(60);
check((await bright(hat)).includes('brightness(1)') && (await hat.locator('.hl').isVisible()), '[근접 조사] 마우스를 올리면 밝기 100% + 이름표');
check(!(await hat.evaluate((el) => getComputedStyle(el).filter)).includes('drop-shadow'), '[근접 조사] 빛 번짐 테두리가 없다');
await shot('stage7_fix_hover');
await page.mouse.click(hb.x + 2, hb.y + 2);
check((await page.locator('#closeup-detail').count()) === 0, '[근접 조사] 여백을 눌러도 상세 화면이 열리지 않는다');
await page.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2);
await page.waitForSelector('#closeup-detail');
const det = async (label: string) => {
  const a = (await page.locator('#closeup-detail .dart img, #closeup-detail .dart .dph').boundingBox())!, t = (await page.locator('#closeup-detail .dtext').boundingBox())!;
  check(a.x + a.width <= t.x + 1, `[근접 조사] ${label}: 확대 그림은 왼쪽, 글은 오른쪽 칸 (겹치지 않음)`);
  const fits = await page.locator('#closeup-detail .dbody').evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
  check(fits, `[근접 조사] ${label}: 설명 글이 모두 보인다`);
};
await det('모자 1920×1080');
check((await page.locator('#closeup-detail .dbody').innerText()).includes('오래 쓴 모자다.'), '[근접 조사] 모자 설명');
await shot('stage7_fix_hat_1920');
await page.setViewportSize({ width: 1280, height: 720 }); await wait(250);
await det('모자 1280×720');
await shot('stage7_fix_hat_1280');
await press('Enter'); await press('ArrowRight'); await press('Enter'); // 상세 닫기 → 캘린더 선택 → 상세
await page.waitForSelector('#closeup-detail');
await det('캘린더 1280×720');
check((await page.locator('#closeup-detail .dbody').innerText()).includes('8월 17일. 은호 씨와 약속한 날이다.'), '[근접 조사] 캘린더 문구');
await shot('stage7_fix_calendar_1280');
await page.setViewportSize({ width: 1920, height: 1080 }); await wait(250);
await det('캘린더 1920×1080');
await press('Enter'); await press('ArrowRight'); await press('Enter'); // 캘린더 상세 닫기 → 신문 → 상세
await page.waitForSelector('#closeup-detail');
await det('신문 1920×1080');
{ const body = await page.locator('#closeup-detail .dbody.doc').innerText();
  check(body.includes('은혜요양병원 이한신 원장 별세') && body.includes('지병으로 별세') && body.includes('8월 17일') && (await page.locator('#closeup-detail .dbody.doc .dhead').count()) === 1, '[근접 조사] 신문: 기사 본문은 HTML(표제·출처·문단), 병원 측 발표만');
  check(!/의혹|타살|수상/.test(body), '[근접 조사] 신문: 의혹을 쓰지 않는다'); }
await shot('fb3_newspaper_1920');
await press('Enter'); await press('Escape'); // 상세 닫기 → 근접 조사 닫기
check(await cw<boolean>('cw.state.evidenceIds.length === 0'), '[오프닝] 캘린더·모자는 단서로 등록되지 않는다');

// ---- 오프닝: 조작 잠금 → 노크 ----
check(await cw<boolean>('cw.scene.locked'), '[오프닝] 근접 조사를 닫으면 조작이 잠긴다');
const x0 = await cw<number>('cw.scene.player.x');
await page.keyboard.down('ArrowRight'); await wait(300); await page.keyboard.up('ArrowRight');
await press('Tab');
check((await cw<number>('cw.scene.player.x')) === x0 && (await page.locator('#notebook').count()) === 0, '[오프닝] 잠긴 동안 이동·Tab 이 동작하지 않는다');
await page.waitForSelector('#dialogue');
await wait(100);
check((await page.locator('#dialogue .name').innerText()) === '???', '[오프닝] 노크: 화자 “???”');
await wait(150); // 타이핑이 끝난 뒤
check((await page.locator('#dialogue .text').innerText()) === '(똑똑똑)' && (await page.locator('#dialogue .portrait').count()) === 0, '[오프닝] “(똑똑똑)” — 소리 묘사는 괄호로, 초상은 숨긴다');
await shot('stage7_fix_knock');
await press('Enter');
await wait(150);
check((await page.locator('#dialogue .name').innerText()) === NAME && (await page.locator('#dialogue .text').innerText()) === '들어오세요.', '[오프닝] 플레이어: “들어오세요.” (화자 이름은 입력한 이름)');
await press('Enter'); // 대사 끝 → 연출
await wait(150);
check(await cw<boolean>("!cw.scene.actors.get('eunho').visible"), '[오프닝] 카메라가 움직이는 동안 박은호는 아직 사무실에 없다');
await page.waitForFunction(() => (window as any).__cw.scene.actors.get('eunho').visible, null, { timeout: 8000 });
check(true, '[오프닝] 카메라가 문에 멈춘 뒤 박은호가 나타난다');
const doorX = await cw<number>("cw.scene.actors.get('eunho').x");
check(doorX === 540, '[오프닝] 박은호는 문 앞에 나타난다');
await shot('stage7_fix_enter');
await page.waitForFunction(() => (window as any).__cw.scene.actors.get('eunho').x < 500, null, { timeout: 5000 });
await wait(300);
await shot('stage7_fix_walk');
await page.waitForSelector('#dialogue', { timeout: 15000 });
await wait(60);
const gap = (await cw<number>("cw.scene.actors.get('eunho').x")) - (await cw<number>('cw.scene.player.x'));
check(Math.abs(gap - 72) <= 1, '[오프닝] 박은호는 플레이어 앞 72px 까지 걸어온다');
check(await cw<boolean>('!cw.scene.playerFacesLeft()') && await cw<boolean>("cw.scene.actors.get('eunho').flipX === false"), '[오프닝] 서로 마주 본다 (박은호 원본이 왼쪽을 보므로 flip 없음)');
await press('Enter');
await page.waitForFunction((t) => document.querySelector('#dialogue .text')?.textContent?.includes(t), `${NAME} 탐정님 사무실…맞죠?`, { timeout: 5000 });
check(true, '[씬 1] 박은호는 인사부터 한다 ({player} 토큰이 입력한 이름으로)');
for (let i = 0; i < 14 && !(await page.locator('#dialogue .text').innerText()).includes('병원은 은지가 치료 중이라고만 합니다'); i++) { await wait(80); await press('Enter'); } // 인사·소개(3줄) 뒤 본론
check((await page.locator('#dialogue .text').innerText()).includes('병원은 은지가 치료 중이라고만 합니다'), '[씬 1] 인사·소개 뒤 기획서 문장(본론)');
check((await page.locator('#dialogue .name').innerText()) === '박은호', '[씬 1] 박은호 화자');
await noIds('[씬 1] 대화창');
await noDefault('[씬 1] 대화창');
await shot('stage4_scene1_dialogue');
await mash();
await page.waitForSelector('#viewer');
check((await docText()).includes('하늘 언니가 다음 명단에 내 이름이 있다고 했어') && (await docText()).includes('입원번호 EW-0827'), '[씬 1] 편지 전문(E01)과 봉투 정보가 HTML 로 표시된다');
check((await page.locator('#viewer .docbg').count()) === 1, '[씬 1] 편지 일러스트(item_letter)가 배경');
await noIds('[씬 1] 편지');
await shot('stage4_letter');
check(await cw<boolean>('cw.scene.locked'), '[오프닝] 편지를 보는 동안에도 조작은 잠겨 있다');
await closeViewer();
check(await cw<boolean>("cw.state.evidenceIds.includes('E01_last_letter') && cw.state.evidenceIds.length === 1"), '[씬 1] E01 획득');
await page.waitForFunction(() => !(window as any).__cw.scene.locked, null, { timeout: 8000 });
check(await cw<boolean>("!cw.scene.actors.get('eunho').visible"), '[오프닝] 박은호는 문으로 걸어 나가 사라진다');
check((await page.locator('.hintbanner').innerText()).includes('방향키(←, →) 또는 A, D로 움직이자'), '[오프닝] 튜토리얼 힌트 1');
await wait(4300);
check((await page.locator('.hintbanner').innerText()).includes('Tab을 눌러 확보한 단서를 확인하자'), '[오프닝] 튜토리얼 힌트 2');
check(await cw<boolean>('cw.scene.started'), '[오프닝] 오프닝이 끝나면 자동 저장이 시작된다');

await teleport(540); await wait(60);
check((await promptText()).includes('[사무실] 나가기'), '[씬 1] 의뢰 후 문이 열린다 (프롬프트: [사무실] 나가기)');
await press('Enter');
await page.waitForSelector('#cutscene', { timeout: 3000 });
check(true, '[씬 1] 병원 도착 컷신');
await wait(500); await noIds('[컷신]');
await page.waitForSelector('#cutscene ~ #dialogue, #dialogue', { timeout: 3000 }); await wait(2300); // 병원 도착 독백 (그림 위 대화창)
check((await page.locator('#dialogue .text').innerText()).startsWith('(도시에서 두 시간') && (await page.locator('#dialogue .voice-inner').count()) === 1, '[씬 1] 병원 도착 독백은 괄호 + 생각 글씨(inner)로 표시된다');
for (let i = 0; i < 14 && (await page.locator('#cutscene').count()); i++) { await press('Enter'); await wait(150); } // 세 줄을 넘긴다
await page.waitForFunction(() => (window as any).__cw.scene.areaId === 'floor1' && !(window as any).__cw.scene.busy, null, { timeout: 4000 });
check(true, '[씬 2] 컷신 후 1층');
check((await promptText()) === '', '[진행] 도착 위치는 다른 전환 지점의 상호작용 범위 밖');

// ---- 씬 2 ----
await page.waitForSelector('#dialogue', { timeout: 15000 }); // 1층 첫 입장: 조작이 잠기고 카메라가 백선우로 옮겨 간 뒤 대화가 자동으로 시작된다
check(await cw<boolean>('cw.scene.locked'), '[씬 2] 1층 첫 입장 연출 중에는 조작이 잠겨 있다');
await wait(60); await press('Enter');
check((await page.locator('#dialogue .text').innerText()).includes('오늘 새벽 원장님께서 지병으로 돌아가셨습니다'), '[씬 2] 백선우 도착 대사 (구역 연출)');
check(await cw<boolean>("cw.state.statements.baek_s_natural?.stage === 'unconfirmed'"), '[씬 2] 백선우의 진술이 수첩에 미확인으로 기록');
await mash();
await page.waitForFunction(() => !(window as any).__cw.scene.locked, null, { timeout: 12000 }); // 대화가 끝나면 백선우가 퇴장하고 조작이 풀린다
check(await cw<boolean>("cw.state.flags.includes('baek_left')") && await cw<boolean>("!cw.scene.npcSprites.has('baek')"), '[씬 2] 백선우가 자리를 비우고 조작이 풀린다');

await teleport(1620); await wait(60);
check((await promptText()).includes('올라가기'), '[진행] 잠긴 계단에도 프롬프트');
await press('Enter');
await page.waitForSelector('#dialogue');
await wait(60); await press('Enter');
check((await page.locator('#dialogue .text').innerText()).includes('올라갈 이유를 아직 찾지 못했다'), '[진행] 잠긴 이유를 한 줄 독백으로 알려 준다');
await mash();
check((await area()) === 'floor1', '[진행] 손목띠(E04)를 얻기 전에는 2층으로 갈 수 없다');

await teleport(690); await wait(60);
check((await promptText()).includes('바닥의 서류'), '[씬 2] 오미란이 떨어뜨린 서류');
await press('Enter');
await page.waitForSelector('#viewer');
check((await docText()).includes('22:52 최초 확인') && (await docText()).includes('후두부 열상 및 출혈 흔적'), '[씬 2] 예비 검안 메모 원문(E03)');
await noIds('[씬 2] E03 원문');
await closeViewer();
check((await page.locator('#puzzle').count()) === 0, '[씬 2] 세 자료가 모이기 전에는 P01 이 열리지 않는다');

await teleport(585); await wait(60); await press('Enter');
await page.waitForFunction(() => (window as any).__cw.scene.areaId === 'room_director' && !(window as any).__cw.scene.busy);
await teleport(225); await wait(60);
check((await promptText()) === '', '[씬 2] 자료가 모이기 전에는 평면도가 열리지 않는다');
await teleport(90); await wait(60);
check((await promptText()).includes('기도대'), '[씬 2] 기도대 조사 지점');
await press('Enter');
await page.waitForSelector('#dialogue');
await wait(60); await press('Enter');
check((await page.locator('#dialogue .text').innerText()).includes('상판은 닦였는데 받침 밑에는 검붉은 자국이 남았다'), '[씬 2] 조사 독백은 기획서 그대로');
await shot('stage4_director_investigate');
await mash();
await page.waitForSelector('#viewer'); await closeViewer();
check(await cw<boolean>("cw.state.evidenceIds.includes('E02_altar_blood') && !cw.state.verifiedEvidenceIds.includes('E02_altar_blood')"), '[씬 2] E02 는 미검증으로 등록');
check((await page.locator('#puzzle').count()) === 0, '[씬 2] 두 자료로는 P01 이 열리지 않는다');
await teleport(630); await wait(60); await press('Enter');
await page.waitForSelector('#dialogue');
await wait(60); await press('Enter');
check((await page.locator('#dialogue .text').innerText()).includes('환자 물건이 원장 책상 밑에서 찢어진 채 나왔다'), '[씬 2] 손목띠 조사 독백');
await mash();
await page.waitForSelector('#viewer');
check((await docText()).includes('정ㅎ / 2병동 / 04') && !(await docText()).includes('정하늘'), '[씬 2] 손목띠 조각: 이름은 정ㅎ 로만 보인다');
await closeViewer();
check((await page.locator('#puzzle').count()) === 0, '[씬 2] 세 자료가 있어도 의자를 조사하기 전에는 P01 이 열리지 않는다');
await teleport(700); await wait(60);
check((await promptText()).includes('책상 의자'), '[씬 2] 원장실 의자 조사 지점 (반짝임으로 찾는다)');
check((await page.locator('#ui').innerText()).length > 0 && await cw<boolean>("cw.scene.children.list.some((c) => c.texture && c.texture.key.startsWith('sparkle') && Math.abs(c.x - 700) < 3)"), '[씬 2] 아직 조사하지 않은 의자 위에 반짝임이 보인다');
await press('Enter');
await page.waitForSelector('#dialogue');
await wait(60); await press('Enter');
check((await page.locator('#dialogue .text').innerText()).startsWith('(의자 다리 아래 바닥이 기도대 쪽에서부터 길게 긁혀 있다') && (await page.locator('#dialogue .voice-inner').count()) === 1, '[씬 2] 의자 조사 독백(생각, 괄호 표시)');
check(await cw<boolean>("cw.state.statements.han_o_chair?.speaker === 'han_jisu' && cw.state.evidenceIds.length === 4"), '[씬 2] 관찰 카드(한지수)를 얻고 새 단서 ID 는 늘지 않는다');
await mash();
await page.waitForSelector('#puzzle', { timeout: 3000 });
check(true, '[P01] 세 자료와 의자 관찰이 모이면 평면도가 자동으로 열린다');
await noIds('[P01] 초기 화면');
await shot('stage4_p01_start');
check((await page.locator('#puzzle .pz-ov').count()) === 1 && (await page.locator('#puzzle .pz-ov').innerText()).includes('세 번까지 확정할 수 있다') && (await page.locator('#puzzle .pz-ov').innerText()).includes('보류하고 나가도 된다'), '[P01] 처음 열릴 때 규칙 안내 한 번: 결론은 세 번까지, 확신이 없으면 보류');
await dismissRule(page);
const pz = async () => (await page.locator('#puzzle').innerText()).replace(/\s+/g, ' ');
check((await page.locator('#puzzle [data-choice]').count()) === 3 && (await page.locator('#puzzle [data-piece]').count()) === 0 && (await pz()).includes('질문 1. 원장의 직접 사인은 무엇인가?'), '[P01] 추리 문답: 첫 질문과 선택지 3개 (조각 놓기가 아니다)');
check((await page.locator('#puzzle [data-choice] b').first().innerText()).length > 4 && (await page.locator('#puzzle [data-choice] i').first().innerText()).startsWith('‹'), '[P01] 선택지는 “판단 + 이유”이고 이유마다 출처(단서·진술 이름)가 보인다');
check((await page.locator('#puzzle [data-submit][disabled]').count()) === 1 && (await page.locator('#puzzle [data-hold]').isVisible()) && (await page.locator('#puzzle .pz-att').innerText()).includes('3/3'), '[P01] 마지막 판단까지 가기 전에는 [결론 확정]을 누를 수 없고, [보류하고 나가기]가 눈에 띄며, 남은 기회 3/3');
check((await page.locator('#puzzle [data-src]').count()) === 3, '[P01] 화면 옆에서 원문 열기(관련 단서 3개)를 할 수 있다');
await page.locator('#puzzle [data-src]').first().click(); await page.waitForSelector('#viewer'); await press('Enter'); await page.waitForFunction(() => !document.querySelector('#viewer')); await wait(100);
check((await page.locator('#puzzle').count()) === 1, '[P01] 원문을 읽고 닫으면 문답으로 돌아온다');
// 키보드: Enter 로 첫 선택지, Backspace 로 이전 질문
await press('Enter'); await wait(80);
check((await pz()).includes('질문 2.') && (await page.locator('#puzzle .qt').count()) === 1, '[P01] 키보드 Enter 로 고르면 다음 질문으로 간다 (맞고 틀림은 알려 주지 않는다)');
check((await page.locator('#puzzle .warn, #puzzle .hint-t, #puzzle .ok, #puzzle .bad').count()) === 0 && !/정답|오답|맞았|틀렸/.test(await pz()), '[P01] 문답 도중에는 맞고 틀림을 알리지 않는다');
await press('Backspace'); await wait(80);
check((await pz()).includes('질문 1.') && (await page.locator('#puzzle .qt').count()) === 0, '[P01] Backspace(이전 질문으로)로 되돌아갈 수 있다');
// 마우스: 틀린 길 (머리 손상 → 발작 → 기도대 옆 바닥 → 시신·의자를 옮김). 지나온 판단을 눌러 되돌아갈 수도 있다.
await page.locator('#puzzle [data-choice="c1_head"]').click(); await page.locator('#puzzle [data-choice="c2_seizure"]').click();
await page.locator('#puzzle .qt').nth(0).click(); await wait(60);
check((await pz()).includes('질문 1.'), '[P01] 지나온 판단(1번)을 누르면 그 질문으로 돌아간다');
await page.locator('#puzzle [data-choice="c1_head"]').click(); await page.locator('#puzzle [data-choice="c2_seizure"]').click(); await page.locator('#puzzle [data-choice="c3_altar"]').click(); await page.locator('#puzzle [data-choice="c4_moved"]').click(); await wait(80);
check((await page.locator('#puzzle [data-submit]:not([disabled])').count()) === 1 && (await page.locator('#puzzle .qconc').innerText()).includes('발작으로 쓰러지며') && (await page.locator('#puzzle .qconc').innerText()).includes('시신과 의자를 옮겨'), '[P01] 마지막 판단에 이르면 지나온 판단이 한 문장 결론으로 보이고 확정할 수 있다');
await shot('stage4_p01_conclusion');
await page.locator('#puzzle [data-submit]').click();
check((await page.locator('#puzzle .pz-ov').innerText()).includes('이 결론을 확정할까요?') && (await page.locator('#puzzle .pz-ov').innerText()).includes('남은 기회 3/3'), '[P01] 확정 전에 확인 창: 이 결론을 확정할까요? 남은 기회 3/3');
await page.locator('#puzzle [data-confirm="no"]').click();
check(await cw<boolean>('!cw.state.wrongCountByPuzzle.P01_scene_rebuild'), '[P01] 확인 창에서 취소하면 기회가 줄지 않는다');
await confirm(page);
{ const warn = await warnLines();
  check(warn.length === 1 && warn[0].includes('찢어진 손목띠 조각') && !warn.join().includes('몸싸움') && !warn.join().includes('기도대 옆 바닥'), '[P01] 1번째 오답: 충돌 문장 하나(처음 틀린 판단과 부딪히는 자료 이름만, 정답은 말하지 않음)'); }
check((await page.locator('#puzzle .hint-t').innerText()).includes('힌트') && (await page.locator('#puzzle .pz-att').innerText()).includes('2/3') && await cw<boolean>('cw.state.wrongCountByPuzzle.P01_scene_rebuild === 1'), '[P01] 1번째 오답: 힌트 문장 + 남은 기회 2/3');
await noIds('[P01] 오답 화면');
// 보류하고 나가기: 지나온 판단과 남은 기회가 저장되고 벌점이 없다
await page.locator('#puzzle [data-hold]').click(); await page.waitForSelector('#dialogue');
check((await page.locator('#dialogue .text').innerText()).length >= 0 && await cw<boolean>("!!cw.state.puzzleDrafts.P01_scene_rebuild && cw.state.wrongCountByPuzzle.P01_scene_rebuild === 1"), '[P01] 보류: 지나온 판단 저장, 기회는 그대로(2/3)');
await wait(2200); check((await page.locator('#dialogue .text').innerText()).includes('미결 사건'), '[미결 사건] 보류하고 나가면 처음 한 번 독백으로 알려 준다');
await mash();
await cw("cw.ui.puzzle('P01_scene_rebuild')"); await page.waitForSelector('#puzzle'); await wait(200);
check((await page.locator('#puzzle .qt').count()) === 4 && (await page.locator('#puzzle .pz-att').innerText()).includes('2/3'), '[P01] 다시 열면 지나온 판단과 남은 기회(2/3)가 그대로다');
await page.mouse.move(5, 5);
await placeCorrect(page, 'P01_scene_rebuild');
check((await page.locator('#puzzle .qconc').innerText()).includes('몸싸움 중 밀려') && (await page.locator('#puzzle .qconc').innerText()).includes('지병으로 꾸몄다'), '[P01] 정답 길의 결론 문장');
await confirm(page);
check(await cw<boolean>("cw.state.solvedPuzzleIds.includes('P01_scene_rebuild') && cw.state.flags.includes('flag_scene_rebuilt') && cw.state.flags.includes('puzzle_done:P01_scene_rebuild')"), '[P01] 정답 → 해결 (puzzle_done 플래그)');
check(await cw<boolean>("cw.state.verifiedEvidenceIds.includes('E02_altar_blood') && cw.state.verifiedEvidenceIds.includes('E03_preliminary_exam')"), '[P01] 해결 → E02·E03 검증');
await press('Enter'); await cw("cw.openDialogue('mono_p01_solved')"); // (시험 훅으로 연 퍼즐이라 해결 독백은 직접 연다)
await page.waitForSelector('#dialogue');
await wait(60); await press('Enter');
const mid = await page.locator('#dialogue .text').innerText();
check(mid.includes('누군가 시신을 옮겼다') && !mid.includes('정하늘'), '[P01] 중간 결론만: 누군가 시신을 옮겼다 (옮긴 사람·정하늘은 확정하지 않는다)');
await mash();

await teleport(360); await wait(60); await press('Enter');
await page.waitForFunction(() => (window as any).__cw.scene.areaId === 'floor1' && !(window as any).__cw.scene.busy);
await press('Enter'); await press('Enter'); await press('Enter'); await wait(150); // 대상이 없을 때 누른 Enter 가 쌓여 있으면 안 된다
await teleport(1620); await wait(1200);
await shot('stage7_fix_stairs');
check((await area()) === 'floor1' && (await promptText()).includes('올라가기'), '[진행] 계단 앞에 서 있기만 해서는 구역이 바뀌지 않는다 (프롬프트만 뜬다)');
await press('Enter');
await page.waitForFunction(() => (window as any).__cw.scene.areaId === 'floor2' && !(window as any).__cw.scene.busy);
check((await promptText()) === '', '[진행] 2층 도착 위치는 계단·문의 상호작용 범위 밖');
check(true, '[진행] 손목띠(E04)를 얻으면 1층 → 2층 계단이 열린다 (P01 과 무관)');

await press('Tab'); await page.waitForSelector('#notebook');
await noIds('[수첩] 단서 목록');
check(!(await page.locator('#notebook').innerText()).includes('정하늘'), '[수첩] 초반 단서 목록에 정하늘 이름이 나오지 않는다');
await press('ArrowRight', 2); // 질문 A
check((await page.locator('#notebook').innerText()).includes('결론은 저장만 된다'), '[수첩] 첫 가설은 저장만 가능하다는 안내');
await press('Tab');


// =====================================================================
// 씬 3~4: 병동 → P02 → 3층 → 백선우·오미란·이혜정 → P03 · P04 → 지하 계단 개방
// =====================================================================
const until = async (text: string) => {
  for (let i = 0; i < 25; i++) {
    await wait(40);
    if ((await page.locator('#dialogue .text').count()) && (await page.locator('#dialogue .text').innerText()).includes(text)) return true;
    await press('Enter');
  }
  return false;
};
const focusOnRow = async (name: string) => {
  for (let i = 0; i < 16; i++) {
    if ((await page.locator('#notebook .row.sel').first().innerText()).includes(name)) return;
    await press('ArrowDown');
  }
};
const enterRoom = async (doorX: number, areaId: string) => {
  await teleport(doorX); await wait(60); await press('Enter');
  await page.waitForFunction((a) => (window as any).__cw.scene.areaId === a && !(window as any).__cw.scene.busy, areaId, { timeout: 4000 });
};
const exitRoom = async (toArea: string) => enterRoom(0, toArea);
const talkTo = async (x: number) => { await teleport(x); await wait(60); await press('Enter'); await page.waitForSelector('#dialogue'); await wait(60); };
/** 플레이어의 짧은 질문(첫 노드)을 넘긴다: 타이핑 완료 → 다음 노드 */
const opener = async () => { await press('Enter'); await wait(40); await press('Enter'); await wait(60); };
const pickEvidence = async (n: number) => { await press('ArrowDown'); await press('Enter'); for (let i = 0; i < n; i++) await press('ArrowDown'); await press('Space'); };

await teleport(1350); await wait(60);
check((await promptText()).includes('올라가기'), '[진행] 3층 계단에도 잠김 프롬프트');
await press('Enter');
await page.waitForSelector('#dialogue'); await wait(60); await press('Enter');
check((await page.locator('#dialogue .text').innerText()).includes('아직 올라갈 이유가 없다'), '[진행] 이야기 사건 전 3층 계단: 한 줄 독백');
await mash();
check((await area()) === 'floor2', '[진행] 정하늘·채소연 대화 전에는 3층에 갈 수 없다');

await enterRoom(270, 'room_choi');
await talkTo(150);
check((await page.locator('#dialogue .name').innerText()) === NAME, '[씬 3] 최옥자 대화는 플레이어의 짧은 질문으로 시작한다');
await opener();
await press('Enter');
check((await page.locator('#dialogue .opt').count()) === 2, '[씬 3] 최옥자: 선택지 2개');
await noIds('[씬 3] 최옥자 대화');
await shot('stage5_scene3_dialogue');
await press('1'); await mash();
check(await cw<boolean>("cw.state.statements.choi_s_prayer?.stage === 'unconfirmed' && cw.state.evidenceIds.length === 4"), '[씬 3] 최옥자 진술은 수첩에만 기록되고 단서가 아니다');
await press('l'); await page.waitForSelector('#backlog');
check((await page.locator('#backlog').innerText()).includes('어르신, 어젯밤 병동에서') && (await page.locator('#backlog').innerText()).includes('원장님은 밤새 기도하셨어요'), '[대사 기록] 탐색 중 L: 이 구역에서 본 대사를 다시 읽는다');
await press('Escape'); await page.waitForFunction(() => !document.querySelector('#backlog'));
await exitRoom('floor2');

await enterRoom(810, 'room_jeong');
await talkTo(190); await mash();
await page.waitForSelector('#viewer'); // E06 원문: 몸싸움 흔적인 소매 조각 (시각·마스터키는 진술 카드)
check((await docText()).includes('찢어진 환자복 소매 조각') && !(await docText()).includes('22:34'), '[씬 3] 채소연 소매 조각(E06) 원문: 물증만 (시각·마스터키는 진술 카드로 분리)');
await closeViewer();
check(await cw<boolean>("cw.state.evidenceIds.includes('E06_torn_sleeve')"), '[씬 3] 채소연: E06 증언 획득');
check((await page.locator('#puzzle').count()) === 0, '[씬 3] 방송표를 보기 전에는 P02 가 열리지 않는다');

// 정하늘 1차 대면
await talkTo(370);
check(await cw<boolean>("cw.state.flags.includes('haneul_met')"), '[씬 3] 정하늘 대화가 시작되면 E04 공개 플래그');
await until('모릅니다.');
await pickEvidence(3);
check((await page.locator('#dialogue').innerText()).includes('정하늘 손목띠 조각'), '[씬 3] 대면 후 E04 표시 이름이 “정하늘 손목띠 조각”');
await noIds('[씬 3] 단서 제시 선택기');
await confirmPick();
await until('그 방에 들어간 적 없어요');
check(await cw<boolean>("cw.state.statements.haneul_s_denial?.stage === 'unconfirmed'"), '[씬 3] “그 방에 들어간 적 없어요”는 진술로만 기록(유죄 단서 아님)');
await mash();
const evCount = await cw<number>('cw.state.evidenceIds.length');
await talkTo(370);
check(await until('박은지 씨의 오빠가 찾고 있습니다.'), '[씬 3] 새로 바뀐 것이 없으면 대화를 처음부터 다시 재생한다');
await mash();
check((await page.locator('#dialogue').count()) === 0 && (await cw<number>('cw.state.evidenceIds.length')) === evCount, '[씬 3] 반복 추궁해도 대화가 늘어나지 않는다 (단서·진술 그대로)');
await exitRoom('floor2');

await enterRoom(540, 'room_han');
await talkTo(150); await mash();
check(await cw<boolean>("cw.state.statements.han_s_bracelet?.stage === 'unconfirmed' && cw.state.flags.includes('han_done')"), '[씬 3] 한유진: 진술 등록(단서 ID 없음), P02 열림 조건에 포함');
await exitRoom('floor2');

// 방송표 → P02
await teleport(1080); await wait(60);
check((await promptText()).includes('복도 방송표'), '[씬 3] 복도 방송표 조사 지점');
await press('Enter');
await page.waitForSelector('#dialogue'); await wait(60); await press('Enter');
check((await page.locator('#dialogue .text').innerText()).includes('예약 재생'), '[씬 3] 방송표: 예약 재생');
await mash();
check(await cw<boolean>("cw.state.statements.choi_s_prayer.stage === 'contradiction'"), '[씬 3] 최옥자 진술이 예약 방송 반증과 연결(모순)');
await page.waitForSelector('#puzzle', { timeout: 3000 });
check(true, '[P02] 2층 진술(최옥자·한유진·채소연) + 정하늘 대면 + 방송표가 모이면 E05 없이도 자동 개방');
await noIds('[P02] 초기 화면');
await dismissRule(page);
check((await page.locator('#puzzle [data-piece]').count()) === 6 && (await page.locator('#puzzle .zone.tl').count()) === 4, '[P02] 조각 6개(진술·기록 4 + 오답 조각 2)와 시간 칸 4개');
// 오답: 예약 방송 조각을 22:46 칸에 (나머지는 정답)
await placeCorrect(page, 'P02_night_timeline', { t2246: ['d_sermon'] });
await confirm(page);
check((await warnLines()).length === 1 && (await warnLines())[0].includes('방송표와 맞지 않는다'), '[P02] 방송 조각을 시간 칸에 넣으면 충돌 문장 하나 (복도 방송표와 맞지 않는다)');
check(await cw<boolean>('cw.state.wrongCountByPuzzle.P02_night_timeline === 1'), '[P02] 오답 1회 기록');
await noIds('[P02] 오답 화면');
await shot('stage5_p02');
// 정답: 키보드 (충돌음 조각을 22:46 칸에 → 방송 조각은 놓지 않은 조각으로 돌아간다)
await page.mouse.move(5, 5);
await click('#puzzle [data-piece="d_sermon"]'); await click('#puzzle [data-zone="t2246"]'); // 방송 조각을 되돌리는 대신 충돌음 조각으로 밀어낸다
await click('#puzzle [data-piece="t_thud"]'); await click('#puzzle [data-zone="t2246"]');
check((await page.locator('#puzzle .pz-side [data-piece="d_sermon"]').count()) === 1, '[P02] 방송 조각은 밀려나 “놓지 않은 조각”으로 돌아간다');
await confirm(page);
check(await cw<boolean>("cw.state.solvedPuzzleIds.includes('P02_night_timeline')"), '[P02] 정답 배열 → 해결');
await press('Enter');
await page.waitForSelector('#dialogue'); await wait(60); await press('Enter');
const p2 = await page.locator('#dialogue .text').innerText();
check(p2.includes('정하늘이 원장실에 있었다') && !/계획|살인|의도/.test(p2), '[P02] 결과 문구는 “정하늘이 원장실에 있었다”까지만');
await mash();

// ---- 씬 4: 3층 ----
await teleport(1350); await wait(60); await press('Enter');
await page.waitForFunction(() => (window as any).__cw.scene.areaId === 'floor3' && !(window as any).__cw.scene.busy);
check(true, '[진행] 정하늘·채소연 대화 후 2층 → 3층 (P02 와 무관)');

// 4-1 백선우
await enterRoom(315, 'room_baek');
await teleport(360); await wait(60);
check((await promptText()) === '', '[씬 4] 백선우가 거절하기 전에는 부원장 PC 를 볼 수 없다');
await talkTo(150); await opener(); await press('Enter');
check((await page.locator('#dialogue .text').innerText()).includes('지병으로 돌아가셨습니다'), '[씬 4] 백선우 첫 진술');
await pickEvidence(1); await confirmPick(); // E03 제시
await wait(60);
check(await cw<boolean>("cw.state.statements.baek_s_natural.stage === 'contradiction'"), '[씬 4] E03 제시 → 기존 진술 baek_s_natural 이 모순으로');
await until('외부인이 볼 자료가 아닙니다.'); await mash();
await teleport(360); await wait(60);
check((await promptText()).includes('부원장 PC'), '[씬 4] 거절 뒤 부원장 PC 조사 가능');
await press('Enter');
await page.waitForSelector('#viewer');
check((await docText()).includes('BSW_ADMIN') && (await docText()).includes('후두부 열상'), '[씬 4] 수정 이력 원문(E07)');
await closeViewer();
check(await cw<boolean>("cw.state.evidenceIds.includes('E07_report_revision') && !cw.state.verifiedEvidenceIds.includes('E07_report_revision')"), '[씬 4] E07 은 미검증으로 등록');
await page.waitForSelector('#puzzle', { timeout: 3000 });
check(true, '[P03] E03 + E07 이 있으면 자동 개방');
await noIds('[P03] 초기 화면');
await dismissRule(page);
check((await page.locator('#puzzle .desk').count()) === 1 && (await page.locator('#puzzle [data-icon]').count()) === 4 && (await page.locator('#puzzle .taskbar').count()) === 1, '[P03] 부원장 PC 바탕화면: 파일 2 · 휴지통 · 문서 비교 아이콘 + 작업 표시줄');
check((await page.locator('#puzzle .win').count()) === 0, '[P03] 처음에는 열린 창이 없다 (더블클릭으로 연다)');
await page.locator('#puzzle [data-icon="file:final"]').dblclick();
check((await page.locator('#puzzle .win').innerText()).includes('발견 위치: 책상 의자') && !(await page.locator('#puzzle .win').innerText()).includes('기도대 옆 바닥'), '[P03] 더블클릭으로 검안기록_최종.txt 를 연다 (최종본: 책상 의자)');
{ const tb = await page.locator('#puzzle .wtitle').first().boundingBox(); const x0 = (await page.locator('#puzzle .win').first().boundingBox())!.x;
  await page.mouse.move(tb!.x + 20, tb!.y + 3); await page.mouse.down(); await page.mouse.move(tb!.x + 70, tb!.y + 10, { steps: 6 }); await page.mouse.up();
  await wait(150); check((await page.locator('#puzzle .win').first().boundingBox())!.x > x0 + 20, '[P03] 창은 제목줄을 끌어 이동할 수 있다'); }
await page.locator('#puzzle [data-wclose]').first().click();
check((await page.locator('#puzzle .win').count()) === 0, '[P03] 창은 × 로 닫을 수 있다');
await page.locator('#puzzle [data-icon="trash"]').dblclick();
check((await page.locator('#puzzle .win').innerText()).includes('검안기록_자동저장.txt'), '[P03] 휴지통에 자동 저장된 이전 판이 있다');
await page.locator('#puzzle [data-wfile="auto"]').click();
check((await page.locator('#puzzle .win').last().innerText()).includes('발견 위치: 기도대 옆 바닥'), '[P03] 이전 판: 발견 위치 기도대 옆 바닥');
await page.locator('#puzzle [data-icon="file:log"]').dblclick();
check((await page.locator('#puzzle .win').last().innerText()).includes('BSW_ADMIN'), '[P03] 수정이력.log: 수정 계정 BSW_ADMIN');
await runDesktopCompare(page);
check((await page.locator('#puzzle .diff').count()) === 3 && !/띄어쓰기|문장 위치|표기/.test(await page.locator('#puzzle .wcmp').innerText()), '[P03] 문서 비교: 바뀐 줄은 의미 있는 3줄뿐 (띄어쓰기·문장 위치·시각 표기 변경은 없다)');
await noIds('[P03] 비교 화면');
await shot('stage5_p03_compare');
// 오답: 발견 위치 줄이 숨긴 사실을 “사망 시각”으로
await placeCorrect(page, 'P03_revision_diff', { chg_position: ['d_time'] });
await confirm(page);
check((await warnLines()).length === 1 && (await warnLines())[0].includes('발견 위치') && !(await warnLines())[0].includes('옮겨'), '[P03] 오답: 충돌 문장 하나 (비교 줄 이름만, 정답은 말하지 않는다)');
await noIds('[P03] 오답 화면');
await placeCorrect(page, 'P03_revision_diff');
await confirm(page);
check(await cw<boolean>("cw.state.solvedPuzzleIds.includes('P03_revision_diff') && cw.state.verifiedEvidenceIds.includes('E07_report_revision')"), '[P03] 정답(키보드) → E07 검증');
await press('Enter'); await page.waitForSelector('#dialogue'); await mash();
await talkTo(150);
check(await until('의학적 판단이 아니라 문장을 지우셨군요.'), '[씬 4] E07 확보 뒤 백선우 후속 대사');
await mash();
await exitRoom('floor3');

// 4-2 오미란
await enterRoom(630, 'room_oh');
await talkTo(150); await opener(); await press('Enter');
check((await page.locator('#dialogue .text').innerText()).includes('의자에 앉은 채 숨을 쉬지 않았어요'), '[씬 4] 오미란 첫 진술');
await pickEvidence(1); await confirmPick(); // E03
check(await cw<boolean>("cw.state.statements.oh_s_first.stage === 'contradiction'"), '[씬 4] E03 제시 → 오미란 진술이 모순으로');
await until('…제가 잘못 적었습니다.');
await pickEvidence(3); await press('ArrowDown'); await press('Space'); // E04 + E06
await confirmPick();
await until('원장님은 기도대 옆 바닥에 누워 있었고');
check(await cw<boolean>("cw.state.statements.oh_s_first.stage === 'revised'"), '[씬 4] E04 + E06 제시 → 수정 진술');
await mash();
check(await cw<boolean>("cw.state.evidenceIds.includes('E08_miran_revised')"), '[씬 4] E08 획득');
await press('Tab'); await page.waitForSelector('#notebook');
await press('ArrowRight');
await focusOnRow('오미란');
check((await page.locator('#notebook').innerText()).includes('기도대 옆 바닥에 누워 있었고'), '[씬 4] 수첩 진술: 원문 취소선 + 수정 문장');
await noIds('[수첩] 진술 탭');
await shot('stage5_miran_revised');
await press('Tab');
await teleport(360); await wait(60); await press('Enter');
await page.waitForSelector('#viewer'); await press('Enter'); await wait(150); // 재고표 원문 (E09) — 이어서 다음 원문이 바로 열린다
await page.waitForSelector('#viewer'); // 이어서 원장실 출입 기록 (E05, 기획서대로 3층 간호사실)
check((await docText()).includes('22:41 / 청소용 마스터키 사용'), '[씬 4] 간호사실 출입 기록(E05) 원문: 22:41 마스터키 사용');
await closeViewer();
check(await cw<boolean>("cw.state.evidenceIds.includes('E09_sedative_gap') && cw.state.verifiedEvidenceIds.includes('E05_access_log') && cw.state.verifiedEvidenceIds.includes('E06_torn_sleeve')"), '[씬 4] 재고표: E09·E05 (P02 를 이미 풀었으므로 E05 즉시 검증, E06 도 검증)');
await exitRoom('floor3');

// 4-3 이혜정
await enterRoom(870, 'room_lee');
await talkTo(150); await mash();
await teleport(340); await wait(60); await press('Enter');
await page.waitForSelector('#viewer'); await press('Enter'); await wait(200);
check((await docText()).includes('지하 보관 자료 동시 반출'), '[씬 4] 지시서 원문(E11)');
await closeViewer();
await page.waitForSelector('#puzzle', { timeout: 3000 });
check(true, '[P04] E10 + E11 → 자동 개방');
await noIds('[P04] 초기 화면');
await dismissRule(page);
check((await page.locator('#puzzle .zone.node').count()) === 4 && (await page.locator('#puzzle [data-person]').count()) === 4 && (await page.locator('#puzzle .form').count()) === 4, '[P04] 승인 체계 트리: 최종 승인 + 선정·시술 진행·이송 지시 칸(서식 문구) + 인물 카드 4장(오답 카드 1)');
check((await page.locator('#puzzle').innerText()).includes('이혜정 · 이사') && !(await page.locator('#puzzle').innerText()).includes('교주'), '[P04] 인물 카드는 이름 · 직함만 (교주 표기 없음)');
await placeCorrect(page, 'P04_approval_chain', { doc_selection: ['lee_hanshin'], doc_approval: ['lee_hyejeong'] });
await confirm(page);
check((await warnLines()).length === 1 && (await warnLines())[0].includes('작성 약자와 맞지 않는다'), '[P04] LHJ/LHS 를 혼동하면 충돌 문장 하나 (위조 동의서 묶음의 작성 약자와 맞지 않는다)');
check(await cw<boolean>("cw.state.wrongCountByPuzzle.P04_approval_chain === 1"), '[P04] 오답 1회 기록');
await noIds('[P04] 오답 화면');
await shot('stage5_p04');
// 2번째 오답: 틀린 후보(오답 인물 카드) 하나가 사라진다
await confirm(page);
check((await page.locator('#puzzle [data-person="oh_miran"]').count()) === 0 && (await page.locator('#puzzle .pz-att').innerText()).includes('1/3'), '[P04] 2번째 오답: 충돌 문장 + 틀린 후보(오미란 카드) 제거, 남은 기회 1/3');
// 정답
await placeCorrect(page, 'P04_approval_chain');
await confirm(page);
check(await cw<boolean>("cw.state.solvedPuzzleIds.includes('P04_approval_chain') && cw.state.verifiedEvidenceIds.includes('E10_consent_forms')"), '[P04] 정답(키보드) → E10·E11 검증');
await press('Enter'); await page.waitForSelector('#dialogue'); await wait(60); await press('Enter');
check((await page.locator('#dialogue .text').innerText()).includes('선정은 이혜정, 승인은 이한신, 실행은 백선우'), '[P04] 중간 결론: 선정·승인·실행');
await mash();
check(await cw<boolean>("!cw.state.flags.includes('basement_key')"), '[진행] P03·P04 를 풀어도 지하 열쇠는 생기지 않는다 (퍼즐은 층 이동과 무관)');

// 오미란에게 이송 지시서(E11)를 보여 주면 지하 열쇠
await exitRoom('floor3');
await enterRoom(630, 'room_oh');
await talkTo(150);
check(await until('부원장님께 먼저 알리는 게 규칙이었어요'), '[진행] 이미 끝난 대화라도 E11 이 있으면 마지막 노드에서 시작한다 (단서 제시로 이어진다)');
await wait(300);
await pickEvidence(await cw<number>("cw.state.evidenceIds.indexOf('E11_transfer_order')")); await confirmPick();
check(await until('은지 씨 침대가 비던 날'), '[진행] E11 제시 → 오미란이 망설이다 지하 열쇠를 건넨다 (봉헌 교리, 죄책감)');
check(await cw<boolean>("cw.state.flags.includes('basement_key')"), '[진행] 지하 열쇠(basement_key)');
await press('Enter'); await wait(150);
check(await until('지하로 내려갈 수 있다'), '[진행] 열쇠를 받으면 지하 계단 개방 안내');
await mash();
await talkTo(150);
check(await until('열쇠는 드렸습니다'), '[진행] 열쇠를 준 뒤 다시 말을 걸면 그 상태의 짧은 대사');
await mash();

// 1층 지하 계단
await exitRoom('floor3');
await teleport(0); await wait(60); await press('Enter');
await page.waitForFunction(() => (window as any).__cw.scene.areaId === 'floor2' && !(window as any).__cw.scene.busy);
await teleport(0); await wait(60); await press('Enter');
await page.waitForFunction(() => (window as any).__cw.scene.areaId === 'floor1' && !(window as any).__cw.scene.busy);
await teleport(1440); await wait(60);
check((await promptText()).includes('지하로 내려가기'), '[진행] 1층 지하 계단 프롬프트가 활성화된다');


// =====================================================================
// 씬 5~7: 지하 → P05 → 정하늘 최종 대면 → 증거 보존 선택 → 최종 보고서 → 엔딩 A
// =====================================================================
await cw("cw.state.flags.push('cutscene_done:basement_intro')"); // 첫 입장 컷신은 위에서 확인했다
await press('Enter');
await page.waitForFunction(() => (window as any).__cw.scene.areaId === 'b1' && !(window as any).__cw.scene.busy);
check(true, '[씬 5] 지하 계단으로 내려간다');
await teleport(270); await wait(60); await press('Enter');
await page.waitForSelector('#viewer');
check((await docText()).includes('P-271 / B형 / 27세') && (await docText()).includes('상태: 처리 완료'), '[씬 5] 장부 원문(E12)');
await noIds('[씬 5] 장부');
await closeViewer();
await teleport(405); await wait(60); await press('Enter');
await page.waitForSelector('#viewer');
check((await docText()).includes('EW-0827 / P-271'), '[씬 5] 코드 연결표(E13): EW-0827 ↔ P-271');
await closeViewer();
await teleport(945); await wait(60); await press('Enter');
await page.waitForSelector('#viewer');
check((await docText()).includes('생체 보존물') && (await docText()).includes('(공란)'), '[씬 5] 운송표(E15): 수용 병원 공란, 생체 보존물');
await closeViewer();
check((await page.locator('#puzzle').count()) === 0, '[씬 5] 보관함을 보기 전에는 P05 가 열리지 않는다');
await teleport(810); await wait(60); await press('Enter');
await page.waitForSelector('#viewer');
check((await docText()).includes('노란 실팔찌') && (await docText()).includes('언니 잘못이 아니라고'), '[씬 5] 유품 보관함(E14): 노란 실팔찌, 일기 마지막 장');
await closeViewer();
await page.waitForSelector('#puzzle', { timeout: 3000 });
check(true, '[P05] 장부·연결표·보관함·운송표가 모이면 자동 개방');
check((await page.locator('#puzzle').innerText()).includes('한유진의 진술') && (await page.locator('#puzzle').innerText()).includes('P-271'), '[P05] 후보 표와 한유진 진술(ID)로 대조');
await dismissRule(page);
await noIds('[P05] 초기 화면');
await shot('stage6_p05_start');
// 오답: 신원을 한유진으로 (나이·혈액형은 맞게)
await placeCorrect(page, 'P05_patient_code', { identity: ['yujin'], admissionMatch: ['yujin'], belongingMatch: ['yujin'] });
await confirm(page);
check((await warnLines()).length === 1 && (await warnLines())[0].includes('연결표'), '[P05] 오답: 충돌 문장 하나, 자료 이름으로 (환자번호-코드 연결표와 맞지 않는다)');
check(!(await page.locator('#puzzle .warn').innerText()).includes('박은지'), '[P05] 오답 표시에 정답 이름이 없다');
check((await page.locator('#puzzle .pfb, #puzzle .pz-fb').first().evaluate((e) => e.scrollHeight <= e.clientHeight + 24)), '[P05] 안내·힌트가 잘리지 않는다');
await noIds('[P05] 오답 화면');
await shot('stage6_p05');
// 정답: 토큰을 떼고 다시 놓고, 선택을 고친다
await page.locator('#puzzle [data-token="identity"]').first().click();
await page.evaluate(() => { document.querySelectorAll<HTMLElement>('#puzzle .chip.on').forEach((c) => c.click()); });
await placeCorrect(page, 'P05_patient_code');
await confirm(page);
check(await cw<boolean>("cw.state.solvedPuzzleIds.includes('P05_patient_code') && cw.state.verifiedEvidenceIds.includes('E12_ledger') && cw.state.verifiedEvidenceIds.includes('E15_transport_manifest') && cw.state.flags.includes('flag_claim_d_open')"), '[P05] 해결 → E12~E15 검증, 질문 D 개방');
await press('Enter'); await page.waitForSelector('#dialogue'); await wait(60); await press('Enter'); await press('Enter'); // P05 결과 독백

// 정하늘 최종 대면 (일기장을 닫은 뒤 계단 쪽에서 등장, 2층 재방문 없음)
await page.waitForSelector('#dialogue', { timeout: 20000 }); // 발소리 → 계단 쪽에서 걸어 들어온 뒤 대화
check((await area()) === 'b1', '[씬 5] 정하늘은 지하에서 나타난다 (2층 재방문 없음)');
await until('명단에서 제 이름도 봤어요');
check((await page.locator('#dialogue .opt').count()) === 3, '[씬 5] 정하늘 최종 대면: 선택지 3개');
await noIds('[씬 5] 정하늘 대면');
await shot('stage6_haneul');
const optCount = async (n: number) => { for (let i = 0; i < 25 && (await page.locator('#dialogue .opt').count()) !== n; i++) { await press('Enter'); await wait(40); } };
await press('1'); await optCount(2);
check((await page.locator('#dialogue .opt').count()) === 2, '[씬 5] 들은 선택지는 사라진다');
await press('1'); await optCount(1); await press('1');
check(await until('당신이 민 힘으로 원장은 죽었습니다.'), '[씬 5] 세 선택지를 모두 들으면 [계속] 없이 자연스럽게 이어진다');
check(await until('당신이 민 힘으로 원장은 죽었습니다.'), '[씬 5] “당신이 민 힘으로 원장은 죽었습니다.”');
check(await until('제가 한 일이 없던 일이 되는 건 아니라는 거.'), '[씬 5] 정하늘은 정당방위로 면죄를 주장하지 않는다');
check(await until('특별 치료 대상자 이송까지 15분 남았습니다.'), '[씬 5] 방송: 이송까지 15분');

// 씬 6: 증거 보존 선택
await press('Enter'); // 대화 끝 → 씬 6
await page.waitForSelector('#dialogue'); await wait(60);
check(await until('뭐든 찾았으면 먼저 보내 주세요.'), '[씬 6] 박은호 메시지');
check((await page.locator('#dialogue.message').count()) === 1 && (await page.locator('#dialogue .name').innerText()).includes('박은호의 메시지') && (await page.locator('#dialogue .portrait').count()) === 0 && !(await page.locator('#dialogue .text').innerText()).startsWith('('), '[씬 6] 박은호의 메시지는 대화가 아니라 메시지 띠(머리말, 초상·괄호 없음)로 보인다');
check(await cw<boolean>("cw.scene.npcSprites.get('haneul_b1')?.visible === true && !cw.state.flags.includes('haneul_cleared')"), '[씬 6] 증거 보존 선택이 끝날 때까지 정하늘은 유품 보관함 옆에 남아 있다');
await page.keyboard.press('l'); await page.waitForSelector('#backlog');
check((await page.locator('#backlog').innerText()).includes('정하늘') && (await page.locator('#backlog').innerText()).includes('박은호의 메시지'), '[대사 기록] 대화 중 L: 정하늘 고백과 박은호의 메시지가 기록에 있다');
await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('#backlog'));
await press('Enter');
check(await until('이 선택은 되돌릴 수 없다.'), '[씬 6] 선택 전에 “원본 자료가 회수될 수 있고, 되돌릴 수 없다”를 명확히 경고');
check((await page.locator('#dialogue .opt').count()) === 2 && (await page.locator('#dialogue').innerText()).includes('원본 자료가 회수될 수 있다'), '[씬 6] 선택 B 항목에도 회수 경고');
await noIds('[씬 6] 선택');
await shot('stage6_choice');
await press('1'); // 선택 A
await wait(60); await press('Enter');
check(await cw<boolean>("cw.state.evidenceSecured && cw.state.evidenceIds.includes('E16_secure_receipt')"), '[씬 6] 선택 A: E16 + 증거 보존');
await press('Enter'); // 대화 끝 → 씬 7

// 씬 7: 최종 보고서
await page.waitForSelector('#report', { timeout: 3000 });
check(true, '[씬 7] 최종 보고서 시작');
check(await cw<boolean>("cw.state.flags.includes('haneul_cleared')") && await cw<boolean>("!cw.scene.npcSprites.get('haneul_b1')?.visible"), '[씬 7] 보고서로 넘어갈 때 정하늘이 정리된다');
const selText = async (sel: string) => (await page.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
// 질문 A~D 네 개를 보고서 화면에서 직접 채운다 (시험 훅 사용 안 함): A = 키보드, B~D = 마우스(근거 카드 한 장은 끌어서)
const claimsToFill: [string, string, string[], string][] = [
  ['claim_a', '기도대 충돌', ['기도대 아래 혈흔', '예비 검안 메모'], '검안 기록 수정 이력'],
  ['claim_b', '은지와 자신을 구하려', ['정하늘 손목띠 조각', '오미란의 수정 진술'], '원장실 출입 기록'],
  ['claim_c', '이혜정 이사가 기록과 현장', ['검안 기록 수정 이력', '오미란의 수정 진술'], '찢어진 환자복 소매'],
  ['claim_d', 'P-271로 분류', ['특별 치료 장부', '박은지의 유품과 일기'], '생체 보존물 운송표'],
];
check((await page.locator('#report .rtab').count()) === 5 && (await page.locator('#report .rpaper').innerText()).includes('질문 A.') && (await page.locator('#report .rdrawer').count()) === 1, '[보고서] 종이 한 장에 질문 하나, 위쪽 탭(질문 A~D·보고 대상), 왼쪽 단서 서랍');
check((await page.locator('#report .rblank').innerText()).includes('눌러서 고른다') && (await page.locator('#report .rpaper').innerText()).includes('원장의 직접 사인은') && (await page.locator('#report .rpaper').innerText()).includes('이다.'), '[보고서] 가설은 문장 빈칸으로 고른다 (원장의 직접 사인은 [ ▾ ]이다.)');
check((await page.locator('#report .rslot').count()) === 3 && (await page.locator('#report .rpaper').innerText()).includes('예상 반론'), '[보고서] 근거 2칸 + 예상 반론 1칸');
check((await page.locator('#report .rcard').count()) === 0 && (await page.locator('#report .dc .rk').first().innerText()).length > 0, '[보고서] 서랍 카드에 유형 표시(물증·기록·증언)가 보인다');
{ const ctx = page.locator('#report .dc', { hasText: '박은지의 마지막 편지' }); await ctx.first().click(); await wait(60);
  await page.locator('#report [data-slot="s0"]').click(); await wait(60);
  check((await page.locator('#report .rmsg').innerText()).includes('맥락') && (await page.locator('#report .rslot .rcard').count()) === 0, '[보고서] 맥락 단서는 꽂히지 않고 이유만 한 줄로 보인다');
  await press('Escape'); }
const pickCards = async (sup: string[], reb: string, byMouse = true) => {
  const card = async (title: string) => page.locator('#report .dc', { hasText: title }).first();
  for (const [slot, title] of [['s0', sup[0]], ['s1', sup[1]], ['r0', reb]] as const) {
    await page.locator(`#report [data-slot="${slot}"]`).click(); await wait(60);
    if (slot === 's0' && byMouse) { // 첫 카드는 끌어서 꽂는다
      await press('Escape');
      const a = await (await card(title)).boundingBox(), b = await page.locator('#report [data-slot="s0"]').boundingBox();
      await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2); await page.mouse.down(); await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2, { steps: 8 }); await page.mouse.up(); await wait(100);
    } else await (await card(title)).click();
    await wait(60);
  }
};
// 질문 A: 키보드
await press('Enter'); // 빈칸 → 후보 문장 목록
check((await page.locator('#report .ropt').count()) === 3, '[보고서] 빈칸을 누르면 후보 문장 3개가 나온다 (순서는 섞여 있다)');
for (let i = 0; i < 4 && !(await selText('#report .ropt.foc')).includes('기도대 충돌'); i++) await press('ArrowDown');
await press('Enter');
check((await page.locator('#report .rblank').innerText()).includes('기도대 충돌'), '[보고서] 키보드로 후보 문장을 골라 빈칸을 채운다');
for (const [k, title] of [['s0', '기도대 아래 혈흔'], ['s1', '예비 검안 메모'], ['r0', '검안 기록 수정 이력']] as const) {
  await press('ArrowDown'); await press('Enter'); // 칸 → 서랍
  for (let i = 0; i < 30 && !(await selText('#report .dc.foc')).includes(title); i++) await press('ArrowDown');
  await press('Enter');
  check((await selText(`#report [data-slot="${k}"]`)).includes(title), `[보고서] 키보드: ${title} 카드를 ${k} 칸에 꽂는다`);
}
await press('ArrowDown'); await press('Enter'); // 도장
check(await cw<boolean>('!!cw.state.selectedHypothesisByClaim.claim_a && cw.state.submittedEvidenceByClaim.claim_a.length === 2 && cw.state.submittedRebuttalByClaim.claim_a.length === 1') && (await page.locator('#report .rstamp').count()) === 1, '[보고서] 키보드로 질문 A 작성 완료 도장 (시험 훅 없음)');
await shot('stage6_report');
for (let i = 1; i < claimsToFill.length; i++) {
  const [cid, hyp, sup, reb] = claimsToFill[i];
  await page.locator(`#report [data-pg="${i}"]`).click(); await wait(80);
  await page.locator('#report [data-blank]').click(); await page.locator('#report .ropt', { hasText: hyp }).click(); await wait(60);
  await pickCards(sup, reb, i === 1);
  if (i === 1) check((await page.locator('#report .rslot .rcard').count()) === 3, '[보고서] 서랍 카드를 끌어다 칸에 꽂는다 (마우스 드래그)');
  await page.locator('#report [data-stamp]').click(); await wait(80);
  check(await cw<boolean>(`!!cw.state.selectedHypothesisByClaim.${cid} && cw.state.submittedEvidenceByClaim.${cid}.length === 2 && cw.state.submittedRebuttalByClaim.${cid}.length === 1`), `[보고서] 질문 ${'ABCD'[i]} 작성 완료 도장 (시험 훅 없음)`);
}
check((await page.locator('#report .rtab.done').count()) === 4, '[보고서] 도장을 찍은 질문 탭에 ✔ 표시');
await page.locator('#report [data-pg="4"]').click(); await wait(100);
await page.locator('#report [data-tg="external"]').click(); await wait(60);
const sum = await page.locator('#report').innerText();
check(sum.includes('외부 수사기관에도 보고한다') && sum.includes('기도대 충돌로 인한 후두부 손상'), '[보고서] 마지막 쪽: 보고 대상 선택 + 완성된 문장으로 읽히는 미리보기');
check(!/정답|오답|해결|엔딩|맞았|틀렸/.test(await page.locator('#report .rpaper').innerText()), '[보고서] 미리보기는 정답·해결 여부·예상 엔딩을 암시하지 않는다');
await noIds('[씬 7] 요약');
await page.locator('#report [data-submit]').click(); await wait(80);
check((await page.locator('#report .rov').innerText()).includes('제출할까요'), '[보고서] 제출 전에 확인 창');
await press('Enter'); // 제출한다

// 엔딩 A
await page.waitForSelector('#ending');
check((await page.locator('#ending').innerText()).includes('은지를 찾은 건 아니네요.'), '[엔딩 A] 마지막 대본: 박은호·플레이어 대화');
await press('Enter'); await press('Enter'); await press('Enter');
const card = await page.locator('#ending').innerText();
check(card.includes('기록된 고해') && card.includes('고해는 죄를 없애지 않는다. 다만 누가 무엇을 했는지 기록하게 한다.'), '[엔딩 A] 엔딩 카드');
check(card.includes('정하늘') && card.includes('조직') && card.includes('박은호'), '[엔딩 A] 결과 세 줄(정하늘/조직/박은호)');
await noIds('[엔딩 A] 카드');
await shot('stage6_ending_a');
await press('Enter');
const gr = await page.locator('#ending').innerText();
check(gr.includes('추리 등급 S') && gr.includes('반박 근거 적중') && gr.includes('힌트가 열린 퍼즐'), '[엔딩 A] 추리 등급: 질문별 해결·반박 적중·힌트 횟수');
check(gr.includes('다시 추리하기') && gr.includes('처음부터') && gr.includes('타이틀로'), '[엔딩 A] 모든 엔딩 끝에 “다시 추리하기” · “처음부터” · “타이틀로”');
await press('ArrowDown', 2); await press('Enter');
await page.waitForSelector('#title');
check((await page.locator('#title').innerText()).includes('이어하기'), '[타이틀] 엔딩 후 타이틀로 돌아오고, 저장이 있으면 이어하기가 보인다');
check((await page.locator('#title').innerText()).includes('조작법'), '[타이틀] 새 게임 / 이어하기 / 조작법');
await press('ArrowDown', 2); await press('Enter');
check((await page.locator('#title .ctrl').innerText()).includes('Tab'), '[타이틀] 조작법 화면');

// =====================================================================
// 분기 시험 (씬 5 까지 건너뛴 상태에서 시작): 선택 B → 엔딩 C
// =====================================================================
const jump = async () => {
  await page.goto(url);
  await page.waitForFunction(() => (window as any).__cw?.scene?.player, null, { timeout: 10000 });
  await startQuick();
  await cw('cw.ff(true)');
  await page.waitForSelector('#dialogue', { timeout: 5000 });
};
const finishReport = async (opts: { good: string[]; target: 'external' | 'eunho_only' }) => {
  await page.waitForSelector('#report', { timeout: 5000 });
  await cw(`(() => { const s = cw.state; const G = { claim_a: [['E02_altar_blood', 'E03_preliminary_exam'], ['E07_report_revision']], claim_b: [['E04_wristband_fragment', 'E08_miran_revised'], ['E05_access_log']],
    claim_c: [['E07_report_revision', 'E08_miran_revised'], ['E06_torn_sleeve']], claim_d: [['E12_ledger', 'E14_belongings_diary'], ['E15_transport_manifest']] };
    for (const [id, [sup, reb]] of Object.entries(G)) { const c = cw.claims.find((x) => x.claimId === id);
      if (${JSON.stringify(opts.good)}.includes(id)) cw.saveConclusion(s, id, c.hypotheses.find((h) => h.isCorrect).id, sup, reb);
      else cw.saveConclusion(s, id, c.hypotheses.find((h) => !h.isCorrect).id, [], ['E02_altar_blood']); } })()`);
  await press('Tab'); await page.waitForSelector('#notebook'); await press('Escape'); await wait(100); // 수첩을 열었다 닫으면 보고서가 저장된 결론을 다시 읽는다
  await press('ArrowRight', 4); // 보고 대상·제출 쪽
  if (opts.target === 'external') await press('ArrowDown');
  await press('Enter'); await press('ArrowDown', opts.target === 'external' ? 1 : 2); await press('Enter'); // 보고 대상 → 제출한다
  await page.waitForSelector('#report .rov'); await press('Enter');
  await page.waitForSelector('#ending');
};
await jump();
await until('뭐든 찾았으면 먼저 보내 주세요.'); await press('Enter');
await until('이 선택은 되돌릴 수 없다.');
await press('2'); // [B] 즉시 대면
check(await until('정말 지금 대면할까.'), '[씬 6] 선택 B: 한 번 더 되돌릴 수 없음을 확인');
await press('2'); // 다시 생각한다
check(await until('이 선택은 되돌릴 수 없다.'), '[씬 6] “다시 생각한다”로 돌아갈 수 있다 (확정 전)');
await press('2'); await until('정말 지금 대면할까.'); await press('1'); // 대면한다
check(await until('P-271은 박은지였습니다.'), '[씬 6] 선택 B 대면 대본');
check(await until('불법 침입으로 얻은 자료는 증거가 될 수 없습니다.'), '[씬 6] 백선우 대사');
check(await until('그리고 그 자료가 계속 그 자리에 있을 거라고 생각하셨나요?'), '[씬 6] 이혜정 대사');
check(await until('병원 직원이 지하 자료를 회수해 갔다.'), '[씬 6] 대면 중 병원 직원이 지하 자료를 회수');
check(await cw<boolean>('!cw.state.evidenceSecured && !cw.state.evidenceIds.includes("E16_secure_receipt")'), '[씬 6] 선택 B: 증거 보존 플래그 없음');
await press('Enter');
await finishReport({ good: ['claim_a', 'claim_b', 'claim_c', 'claim_d'], target: 'external' });
check((await page.locator('#ending').innerText()).includes('빈 병원'), '[엔딩 C] 선택 B 이후에도 보고서를 제출할 수 있고 엔딩 C 가 된다');
await shot('stage6_ending_c');
await press('Enter');
check((await page.locator('#ending').innerText()).includes('다시 추리하기'), '[엔딩 C] 다시 추리하기도 있다');

// 엔딩 D → 보고서 다시 쓰기 → 엔딩 A
await jump();
await until('뭐든 찾았으면 먼저 보내 주세요.'); await press('Enter');
await until('이 선택은 되돌릴 수 없다.');
await press('1'); await wait(60); await press('Enter'); await press('Enter');
await finishReport({ good: ['claim_c', 'claim_d'], target: 'external' }); // 질문 A·B 오답
check((await page.locator('#ending').innerText()).includes('자연사'), '[엔딩 D] 질문 2개 오답');
await press('Enter');
check((await page.locator('#ending').innerText()).includes('다시 추리하기'), '[엔딩 D] 다시 추리하기 선택지 (엔딩 D 전용 재시도와 하나로 합쳤다)');
await shot('stage6_ending_d');
const before = await cw<string>("JSON.stringify({ ev: cw.state.evidenceIds, ver: cw.state.verifiedEvidenceIds, sec: cw.state.evidenceSecured, fail: cw.state.failedPuzzleIds, sel: cw.state.selectedHypothesisByClaim })");
await press('Enter'); // 다시 추리하기
await page.waitForSelector('#report', { timeout: 3000 });
check(await cw<string>("JSON.stringify({ ev: cw.state.evidenceIds, ver: cw.state.verifiedEvidenceIds, sec: cw.state.evidenceSecured, fail: cw.state.failedPuzzleIds, sel: cw.state.selectedHypothesisByClaim })") === before && await cw<boolean>('cw.state.retryClaimIds.length === 2 && cw.state.evidenceSecured'), '[다시 추리하기] 같은 수사 상태(단서·검증·증거 보존·퍼즐 검증 실패)로 이전 결론이 채워진 보고서로 돌아간다');
check((await page.locator('#report .rmsg').innerText()).includes('다시 추리하기') && (await page.locator('#report .rtab.done').count()) === 4, '[다시 추리하기] 이전에 쓴 결론이 그대로 채워져 있다 (도장 4개)');
await press('Tab'); await page.waitForSelector('#notebook');
const firstRow = await page.locator('#notebook .nlist .row').first().innerText();
check(firstRow.includes('미해결 질문 관련'), '[엔딩 D] 수첩 단서 목록에서 미해결 질문과 관련된 단서가 먼저 보인다');
check(!/정답|오답|맞는|틀린/.test(await page.locator('#notebook').innerText()), '[엔딩 D] 어느 단서가 정답인지는 표시하지 않는다');
await noIds('[엔딩 D 재도전] 수첩');
await press('Tab');
await finishReport({ good: ['claim_a', 'claim_b', 'claim_c', 'claim_d'], target: 'external' });
check((await page.locator('#ending').innerText()).includes('기록된 고해') || (await page.locator('#ending').innerText()).includes('은지를 찾은 건 아니네요.'), '[엔딩 D → A] 다시 쓴 보고서로 엔딩 A');



// =====================================================================
// 오프닝 견고성: 각 단계에서 Esc 를 눌러도 꼬이지 않는다 / Enter 길게 눌러 연출 건너뛰기
// =====================================================================
const startReal = async () => {
  await page.goto(url);
  await page.waitForFunction(() => (window as any).__cw?.scene?.player, null, { timeout: 10000 });
  await page.waitForSelector('#title'); await press('Enter'); await page.waitForSelector('#namepopup');
};
await startReal();
await press('Escape'); await wait(100);
check((await page.locator('#namepopup').count()) === 1, '[Esc] 이름 입력 중 Esc 는 아무 일도 일으키지 않는다');
await press('Enter'); await page.waitForSelector('#closeup');
await press('Escape'); // 근접 조사 닫기
await page.waitForSelector('#dialogue'); await wait(200);
await press('Escape'); await wait(80);
check((await page.locator('#dialogue').count()) === 1 && (await page.locator('#dialogue .text').innerText()) === '(똑똑똑)', '[Esc] 노크 대사 중 Esc 는 무시된다');
await press('Enter'); await wait(200); await press('Escape'); await wait(80);
check((await page.locator('#dialogue .text').innerText()) === '들어오세요.', '[Esc] “들어오세요.” 에서도 Esc 는 무시된다');
await press('Enter');
await wait(500); await press('Escape'); await wait(80);
check(await cw<boolean>('cw.scene.locked'), '[Esc] 카메라 연출 중 Esc 를 눌러도 조작 잠금이 풀리지 않는다');
await page.waitForFunction(() => (window as any).__cw.scene.actors.get('eunho').visible, null, { timeout: 8000 });
await press('Escape');
await page.waitForSelector('#dialogue', { timeout: 15000 }); await wait(200);
await press('Escape'); await wait(80);
check((await page.locator('#dialogue .name').innerText()) === '박은호', '[Esc] 박은호 대화 중 Esc 는 무시된다');
await mash();
await page.waitForSelector('#viewer'); await press('Escape'); // 편지 원문: Esc 로 닫는다
await page.waitForFunction(() => !(window as any).__cw.scene.locked, null, { timeout: 8000 });
check(await cw<boolean>("cw.scene.started && cw.state.evidenceIds.includes('E01_last_letter') && !cw.scene.actors.get('eunho').visible") && (await page.locator('#dialogue, #viewer, #closeup, #namepopup').count()) === 0, '[Esc] 편지를 Esc 로 닫아도 오프닝이 정상 종료된다 (E01 획득, 박은호 퇴장, 잔여 창 없음)');
const xe = await cw<number>('cw.scene.player.x');
await page.keyboard.down('ArrowRight'); await wait(400); await page.keyboard.up('ArrowRight');
check((await cw<number>('cw.scene.player.x')) > xe, '[Esc] 오프닝이 끝나면 정상적으로 이동할 수 있다');

await startReal();
await press('Enter'); await page.waitForSelector('#closeup'); await press('Escape');
await page.waitForSelector('#dialogue'); await wait(200); await press('Enter'); await wait(200); await press('Enter'); // 노크 두 줄
const t0 = Date.now();
await page.keyboard.down('Enter'); // 길게 누르기: 연출 건너뛰기
await page.waitForSelector('#dialogue', { timeout: 6000 });
const took = Date.now() - t0;
await page.keyboard.up('Enter');
check(took < 3500, `[건너뛰기] Enter 길게 누르면 오프닝 연출을 건너뛴다 (${took}ms, 자연 진행은 약 6초)`);
const gap2 = (await cw<number>("cw.scene.actors.get('eunho').x")) - (await cw<number>('cw.scene.player.x'));
check(Math.abs(gap2 - 72) <= 1 && (await page.locator('#dialogue .name').innerText()) === '박은호', '[건너뛰기] 건너뛰어도 박은호는 플레이어 앞 72px 에 서 있고 대화가 시작된다');
await mash(); await page.waitForSelector('#viewer'); await closeViewer();
await page.waitForFunction(() => !(window as any).__cw.scene.locked, null, { timeout: 8000 });
check(await cw<boolean>('cw.scene.started'), '[건너뛰기] 이후 오프닝이 정상 종료된다');

// ---- 긴 선택지·제시 목록: 대화창 안에 들어오고, 선택한 줄이 항상 보인다 ----
await page.goto(url);
await page.waitForFunction(() => (window as any).__cw?.scene?.player, null, { timeout: 10000 });
await startQuick(); await cw('cw.scene.jumpToScene(3)'); await wait(700);
await cw("cw.ui.acquire(['E05_access_log','E06_torn_sleeve','E07_report_revision','E08_miran_revised','E09_sedative_gap','E10_consent_forms','E11_transfer_order','E12_ledger'])");
await cw("cw.openDialogue('jeong_haneul')"); await page.waitForSelector('#dialogue');
for (let i = 0; i < 30 && (await page.locator('#dialogue .opt', { hasText: '단서 제시' }).count()) === 0; i++) { await press('Enter'); await wait(150); }
await page.locator('#dialogue .opt', { hasText: '단서 제시' }).click(); await wait(200);
for (let i = 0; i < 12; i++) await press('ArrowDown');
await wait(250);
const fit = await page.evaluate(`(() => {
  var opts = document.querySelector('#dialogue .opts'), ob = opts.getBoundingClientRect(), sel = document.querySelector('#dialogue .opt.sel').getBoundingClientRect(), ui = document.querySelector('#ui').getBoundingClientRect(), dlg = document.querySelector('#dialogue').getBoundingClientRect();
  var all = Array.prototype.map.call(document.querySelectorAll('#dialogue .opt'), function (e) { return e.getBoundingClientRect().bottom; });
  return { scrolls: opts.scrollHeight > opts.clientHeight, selVisible: sel.top >= ob.top - 4 && sel.bottom <= ob.bottom + 4, optsInsideDialog: ob.bottom <= dlg.bottom + 1 && dlg.bottom <= ui.bottom + 1, n: all.length };
})()`) as { scrolls: boolean; selVisible: boolean; optsInsideDialog: boolean; n: number };
check(fit.n >= 9 && fit.scrolls && fit.optsInsideDialog, `[선택지] 긴 증거 제시 목록(${fit.n}줄)은 대화창 안에서 스크롤된다`);
check(fit.selVisible, '[선택지] 선택한 줄이 항상 보이는 영역 안에 있다 (자동 스크롤)');
await press('Escape'); await press('Escape');

// ---- 퍼즐을 하나도 풀지 않고 층 이동 (P05 제외): 이야기 사건만으로 계단이 열린다 ----
await page.goto(url);
await page.waitForFunction(() => (window as any).__cw?.scene?.player, null, { timeout: 10000 });
await startQuick();
for (const n of [2, 3, 4]) await cw(`cw.ui.prepare(${n})`); // 대사·조사까지 마치고 퍼즐은 풀지 않는다
check(await cw<boolean>('cw.state.solvedPuzzleIds.length === 0 && cw.state.flags.includes("basement_key")'), '[퍼즐 없이] 퍼즐을 하나도 풀지 않았고, 오미란의 열쇠까지 이야기로 얻었다');
await cw("cw.state.flags.push('cutscene_done:basement_intro')");
await cw("cw.scene.go('floor1', 1500)"); await wait(900);
await enterArea(36 * 45, 'floor2'); check(true, '[퍼즐 없이] 1층 → 2층');
await enterArea(30 * 45, 'floor3'); check(true, '[퍼즐 없이] 2층 → 3층');
await enterArea(0, 'floor2'); await enterArea(0, 'floor1');
await enterArea(32 * 45, 'b1'); check(true, '[퍼즐 없이] 1층 → 지하 (철창문)');
await press('Tab'); await page.waitForSelector('#notebook'); await press('ArrowLeft'); // 맨 뒤 탭: 미결 사건
const pt = await page.locator('#notebook').innerText();
check(pt.includes('미결 사건') && pt.includes('사건 열기'), '[미결 사건] 재료가 모인 퍼즐이 수첩 "미결 사건" 탭에 남는다');
await press('Enter'); await page.waitForSelector('#puzzle', { timeout: 3000 });
check(true, '[미결 사건] Enter 로 사건(퍼즐)을 다시 연다');
await dismissRule(page); await press('Escape'); await page.waitForSelector('#dialogue'); // 처음 한 번 독백
await wait(2200); // 타이핑이 끝난 뒤
check((await page.locator('#dialogue .text').innerText()).includes('미결 사건'), '[미결 사건] 풀지 않고 닫으면 처음 한 번 독백으로 알려 준다');
await mash();
// 검증 실패: 결론 기회 3번을 모두 쓰면 퍼즐이 닫히고 관련 단서는 검증 실패(신빙성 낮음)로 남는다
await cw("cw.ui.puzzle('P01_scene_rebuild')"); await page.waitForSelector('#puzzle'); await dismissRule(page);
for (let i = 1; i <= 3; i++) {
  await placeCorrect(page, 'P01_scene_rebuild', { path: ['c1_disease', 'ca1_chair', 'ca2_fall'] });
  await confirm(page); await wait(150);
}
check((await page.locator('#puzzle .bad').innerText()).includes('검증 실패') && await cw<boolean>("cw.state.failedPuzzleIds.includes('P01_scene_rebuild') && cw.state.flags.includes('puzzle_failed:P01_scene_rebuild')"), '[검증 실패] 3번째 오답: 검증 실패로 닫힌다 (퍼즐 화면에 이유 표시)');
check((await page.locator('#puzzle [data-submit]').count()) === 0, '[검증 실패] 다시 확정할 수 없다');
await press('Enter'); await page.waitForFunction(() => !document.querySelector('#puzzle'));
check(await cw<boolean>("cw.state.verifiedEvidenceIds.every((id) => id !== 'E02_altar_blood')"), '[검증 실패] 관련 단서(E02·E03)는 검증되지 않는다');
await press('Tab'); await page.waitForSelector('#notebook'); await press('ArrowLeft'); await wait(150);
check((await page.locator('#notebook .row.dis').first().innerText()).includes('검증 실패') && (await page.locator('#notebook button.row', { hasText: '원장실 추리 문답' }).count()) === 0, '[검증 실패] 수첩 “미결 사건” 탭에 “검증 실패”로 표시되고 열 수 없다');
await press('Tab');

// ---- P05 를 보류하면 진행이 멈춘 것처럼 보이지 않게 독백으로 알려 준다 / 계단에서 한 번 더 ----
await page.goto(url);
await page.waitForFunction(() => typeof (window as any).__cw?.scene?.jumpToScene === 'function', null, { timeout: 10000 });
await startQuick();
await cw('cw.scene.jumpToScene(5)'); await wait(700);
await cw("cw.ui.acquire(['E12_ledger', 'E13_identity_map', 'E14_belongings_diary', 'E15_transport_manifest'])"); await cw("cw.state.flags.push('diary_closed')");
await cw("cw.scene.puzzle('P05_patient_code')"); await page.waitForSelector('#puzzle'); await dismissRule(page);
await page.locator('#puzzle [data-hold]').click(); await page.waitForSelector('#dialogue'); await wait(2400);
check((await page.locator('#dialogue .text').innerText()).includes('이 장부를 정리하기 전에는 여기서 더 알아낼 수 없다'), '[P05 보류] 보류하고 나가면 한 번 독백으로 알려 준다 (정하늘이 나타나지 않는 까닭)');
await mash();
check(await cw<boolean>("!cw.state.flags.includes('puzzle_done:P05_patient_code') && cw.state.flags.includes('p05_hold_seen')"), '[P05 보류] 보류는 풀리지도 닫히지도 않은 상태다');
await cw('cw.scene.teleportX(0)'); await wait(300); await press('Enter'); await page.waitForSelector('#dialogue');
await wait(2400);
check((await page.locator('#dialogue .text').innerText()).includes('이 장부를 정리하기 전에는'), '[P05 보류] 지하에서 계단으로 올라가려 할 때 P05 가 미결이면 같은 안내를 한 번 더 보여 준다');
await mash(); await page.waitForFunction(() => (window as any).__cw.scene.areaId === 'floor1', null, { timeout: 6000 });
check(true, '[P05 보류] 안내 뒤에는 막지 않고 올라간다');

// ---- P05 검증 실패로 질문 D 가 열리지 않아도 보고서를 제출할 수 있다 (열린 질문만 도장을 요구한다) ----
await page.goto(url);
await page.waitForFunction(() => typeof (window as any).__cw?.scene?.jumpToScene === 'function', null, { timeout: 10000 });
await startQuick();
await cw("cw.scene.jumpToScene(7, ['P05_patient_code'])"); await page.waitForSelector('#report', { timeout: 6000 }); await wait(600);
await page.locator('#report [data-pg="3"]').click(); await wait(80);
check((await page.locator('#report .rpaper').innerText()).includes('다룰 수 없는 질문') && (await page.locator('#report [data-blank]').count()) === 0, '[보고서] 질문 D 가 열리지 않으면 “다룰 수 없는 질문”이고 비워 둔 채로 제출된다');
await cw(`(() => { const G = { claim_a: [['E02_altar_blood', 'E03_preliminary_exam'], ['E07_report_revision']], claim_b: [['E04_wristband_fragment', 'E08_miran_revised'], ['E05_access_log']], claim_c: [['E07_report_revision', 'E08_miran_revised'], ['E06_torn_sleeve']] };
  for (const [id, [sup, reb]] of Object.entries(G)) cw.saveConclusion(cw.state, id, cw.claims.find((x) => x.claimId === id).hypotheses.find((h) => h.isCorrect).id, sup, reb); })()`);
await press('Tab'); await page.waitForSelector('#notebook'); await press('Escape'); await wait(100);
await page.locator('#report [data-pg="4"]').click(); await page.locator('#report [data-tg="external"]').click(); await page.locator('#report [data-submit]').click(); await page.waitForSelector('#report .rov'); await press('Enter');
await page.waitForSelector('#ending', { timeout: 5000 });
check(true, '[보고서] P05 검증 실패 상태에서도 질문 A~C 만 도장을 찍으면 제출되어 엔딩에 이른다');

await browser.close();
check(errors.length === 0, `콘솔 오류 0 ${errors.join(' | ')}`);
if (fails.length) { console.error(`\nFAIL ${fails.length}건`); process.exit(1); }
console.log('\nE2E OK');
