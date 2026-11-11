// e2e: 테스트 전용 대사를 포함한 file:// 빌드(mode=e2e)를 열어 검증한다.
//  A. 시스템 시험 (테스트 전용 대사): 근접 조사, 선택지, 단서 제시, 진술 3단계, 층 이동, 사건 수첩
//  B. 이야기 시험 (새 게임, 실제 대사): 씬 1 → 씬 2 → P01 → 2층 계단 개방
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';
import { attachCorrectLinks, attachLink } from './puzzle-driver';

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
page.on('requestfailed', (r) => { if (!(/\.(mp3|ogg|wav)$/.test(r.url()) && /ABORTED/.test(r.failure()?.errorText ?? ''))) errors.push(`requestfailed ${r.url()}`); });

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
const noteText = async () => (await page.locator('#puzzle .note').innerText()).trim();
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

await enterArea(36 * 45, 'floor2'); check(true, '1층 → 2층');
await enterArea(30 * 45, 'floor3'); check(true, '2층 → 3층');
await enterArea(0, 'floor2'); check(true, '3층 → 2층');
await enterArea(0, 'floor1'); check(true, '2층 → 1층');
await teleport(32 * 45); await wait(60);
check((await promptText()).includes('지하로 내려가기'), '지하 철창문은 잠겨 있어도 반응한다 (프롬프트)');
await press('Enter'); await page.waitForSelector('#dialogue'); await wait(60); await press('Enter');
check((await page.locator('#dialogue .text').innerText()) === '(철창문이 잠겨 있다. 지하로 내려가려면 이 병원의 관리 권한이 필요해 보인다.)' && (await area()) === 'floor1', '지하 철창문 잠김 독백 (괄호 표시, 이동하지 않는다)');
await press('Enter'); await page.waitForFunction(() => !document.querySelector('#dialogue'));
await cw("cw.state.solvedPuzzleIds.push('P03_revision_diff', 'P04_approval_chain')");
await wait(60);
check((await promptText()).includes('지하로 내려가기'), 'P03·P04 해결 후 지하 계단 프롬프트');
await press('Enter');
await page.waitForFunction(() => (window as any).__cw.scene.areaId === 'b1' && !(window as any).__cw.scene.busy);
check((await area()) === 'b1', '1층 → 지하');

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
await page.goto(url);
await page.waitForFunction(() => (window as any).__cw?.scene?.player, null, { timeout: 10000 });
const noDefault = async (where: string) => { const t = await page.locator('#ui').innerText(); check(!t.includes('한지수'), `${where}: 기본 이름 “한지수” 가 남아 있지 않다`); };
const mash = async () => { for (let i = 0; i < 80; i++) { if (!(await page.locator('#dialogue').count())) return; await press('Enter'); await wait(30); } };
const docText = async () => (await page.locator('#viewer').innerText()).replace(/\s+/g, ' ');
const closeViewer = async () => { await press('Enter'); await page.waitForFunction(() => !document.querySelector('#viewer')); };

// ---- 타이틀 → 이름 입력 ----
await page.waitForSelector('#title');
await shot('stage7_fix_title');
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
check((await page.locator('#closeup .hot').count()) === 2, '[오프닝] 소품은 모자와 캘린더만 (신문 제외)');
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
  const a = (await page.locator('#closeup-detail .dart img').boundingBox())!, t = (await page.locator('#closeup-detail .dtext').boundingBox())!;
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
check(Math.abs(gap - 56) <= 1, '[오프닝] 박은호는 플레이어 앞 56px 까지 걸어온다');
check(await cw<boolean>('!cw.scene.playerFacesLeft()') && await cw<boolean>("cw.scene.actors.get('eunho').flipX === false"), '[오프닝] 서로 마주 본다 (박은호 원본이 왼쪽을 보므로 flip 없음)');
await press('Enter');
check((await page.locator('#dialogue .text').innerText()).includes('병원은 은지가 치료 중이라고만 합니다'), '[씬 1] 첫 대사는 기획서 문장');
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
check((await page.locator('#dialogue .text').innerText()).includes('원장실부터 정리해야 한다'), '[진행] 잠긴 이유를 한 줄 독백으로 알려 준다');
await mash();
check((await area()) === 'floor1', '[진행] P01 해결 전에는 2층으로 갈 수 없다');

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

// P01 오답: 마우스 (클릭 배치 + 드래그 배치)
await click('#puzzle [data-token="impactPosition"]'); await click('#puzzle [data-zone="desk_side"]');
const tk = await page.locator('#puzzle [data-token="finalPosition"]').first().boundingBox();
const zn = await page.locator('#puzzle [data-zone="desk_chair"]').first().boundingBox();
await page.mouse.move(tk!.x + tk!.width / 2, tk!.y + tk!.height / 2);
await page.mouse.down();
await page.mouse.move(zn!.x + zn!.width / 2, zn!.y + zn!.height / 2, { steps: 8 });
await page.mouse.up();
await wait(100);
check((await page.locator('#puzzle [data-zone="desk_chair"] [data-token="finalPosition"]').count()) === 1, '[P01] 마우스 드래그로 토큰 배치');
await click('#puzzle [data-chip="movedObjects|body"]'); await click('#puzzle [data-chip="movedObjects|chair"]');
await click('#puzzle [data-submit]');
await wait(60);
check((await noteText()) === '근거를 붙이지 않은 칸이 있다.' && (await page.locator('#puzzle .warn').count()) === 0 && (await page.locator('#puzzle .lnk.need').count()) === 3, '[P01] 근거를 붙이지 않은 칸이 있으면 안내 하나 + 근거 칸 강조(오답 아님)');
check(await cw<boolean>("!cw.state.wrongCountByPuzzle.P01_scene_rebuild && !cw.state.hintCountByPuzzle.P01_scene_rebuild"), '[P01] 근거 빈 칸은 오답 횟수·힌트를 올리지 않는다');
await attachCorrectLinks(page, 'P01_scene_rebuild'); // 근거는 맞게 붙였지만 토큰(충돌 직후=책상 옆)이 틀리다
await click('#puzzle [data-submit]'); await wait(60);
const warn = await warnLines();
check(warn.length === 1 && warn[0].includes('기도대 아래 혈흔과 맞지 않는다'), '[P01] 오답: 충돌 문장은 하나, 어느 자료와 맞지 않는지 이름으로 말한다');
check(!warn.join().includes('기도대 옆 바닥') && !warn.join().includes('책상 의자'), '[P01] 오답 표시에 정답을 알려주지 않는다');
check(await cw<boolean>("cw.state.wrongCountByPuzzle.P01_scene_rebuild === 1"), '[P01] 오답 1회 기록');
await noIds('[P01] 오답 화면');
await shot('stage4_p01');
await click('#puzzle [data-src]');
await page.waitForSelector('#viewer'); await closeViewer();
check(true, '[P01] 퍼즐 중 원문 자료를 다시 열 수 있다');

// P01 정답: 키보드 (토큰 선택 → 방향키 → Enter)
await page.mouse.move(5, 5);
for (let i = 0; i < 12 && (await page.locator('#puzzle .tk.foc[data-token="impactPosition"]').count()) === 0; i++) await press('ArrowLeft'); // 첫 토큰으로 포커스
await press('Enter'); await press('ArrowLeft'); await press('Enter'); // 충돌 직후 → 기도대 옆 바닥
await press('ArrowRight'); await press('Enter'); await press('Enter'); // 보고서 당시 토큰: 잡았다 그대로 놓기
check((await page.locator('#puzzle [data-zone="altar_floor"] [data-token="impactPosition"]').count()) === 1, '[P01] 키보드로 토큰을 위치에 놓는다');
await attachLink(page, 'finalPosition', 'E02_altar_blood'); // 토큰은 정답이지만 근거가 틀리다
await click('#puzzle [data-submit]'); await wait(100);
check(!(await cw<boolean>("cw.state.solvedPuzzleIds.includes('P01_scene_rebuild')")) && (await warnLines()).length === 1 && (await warnLines())[0].includes('내용을 말해 주지 않는다'), '[P01] 정답 토큰 + 틀린 근거 = 오답 (붙인 자료의 이름을 말한다)');
await attachCorrectLinks(page, 'P01_scene_rebuild');
await click('#puzzle [data-submit]'); await wait(100);
check(await cw<boolean>("cw.state.solvedPuzzleIds.includes('P01_scene_rebuild') && cw.state.flags.includes('flag_scene_rebuilt')"), '[P01] 정답 토큰 + 정답 근거 → 해결, 현장 재구성 플래그');
check(await cw<boolean>("cw.state.verifiedEvidenceIds.includes('E02_altar_blood') && cw.state.verifiedEvidenceIds.includes('E03_preliminary_exam')"), '[P01] E02·E03 검증됨');
await press('Enter');
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
check(true, '[진행] P01 해결 후 1층 → 2층 계단이 열린다');

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
const focusOn = async (sel: string) => { for (let i = 0; i < 40 && (await page.locator(sel).count()) === 0; i++) await press('ArrowRight'); };
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
const pickEvidence = async (n: number) => { await press('ArrowDown'); await press('Enter'); for (let i = 0; i < n; i++) await press('ArrowDown'); await press('Space'); };

await teleport(1350); await wait(60);
check((await promptText()).includes('올라가기'), '[진행] 3층 계단에도 잠김 프롬프트');
await press('Enter');
await page.waitForSelector('#dialogue'); await wait(60); await press('Enter');
check((await page.locator('#dialogue .text').innerText()).includes('병동의 밤 동선부터 정리해야 한다'), '[진행] P02 해결 전 3층 계단: 한 줄 독백');
await mash();
check((await area()) === 'floor2', '[진행] P02 해결 전에는 3층에 갈 수 없다');

await enterRoom(270, 'room_choi');
await talkTo(150);
await press('Enter');
check((await page.locator('#dialogue .opt').count()) === 2, '[씬 3] 최옥자: 선택지 2개');
await noIds('[씬 3] 최옥자 대화');
await shot('stage5_scene3_dialogue');
await press('1'); await mash();
check(await cw<boolean>("cw.state.statements.choi_s_prayer?.stage === 'unconfirmed' && cw.state.evidenceIds.length === 4"), '[씬 3] 최옥자 진술은 수첩에만 기록되고 단서가 아니다');
await exitRoom('floor2');

await enterRoom(810, 'room_jeong');
await talkTo(190); await mash();
await page.waitForSelector('#viewer'); // E06 원문: 22:34 마스터키 분실, 22:51 복귀
check((await docText()).includes('22:34') && (await docText()).includes('22:51') && (await docText()).includes('청소용 마스터키'), '[씬 3] 채소연 증언(E06) 원문에 22:34 마스터키 분실·22:51 복귀가 있다');
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
await talkTo(370);
await until('…더 말하면 저도 없어져요.');
await press('Enter'); await wait(80);
check((await page.locator('#dialogue').count()) === 0, '[씬 3] 반복 추궁해도 대화가 늘어나지 않는다');
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
await page.waitForSelector('#viewer'); // 방송표 아래 단말 출력지: 원장실 출입 기록(E05)을 P02 보다 먼저 읽는다
check((await docText()).includes('22:41 / 청소용 마스터키 사용'), '[씬 3] 방송표 아래 출입 기록(E05) 원문: 22:41 마스터키 사용');
await closeViewer();
await page.waitForSelector('#puzzle', { timeout: 3000 });
check(await cw<boolean>("cw.state.statements.choi_s_prayer.stage === 'contradiction'"), '[씬 3] 최옥자 진술이 예약 방송 반증과 연결(모순)');
check(true, '[P02] 최옥자·채소연 대화 + 방송표 → 자동 개방');
await noIds('[P02] 초기 화면');

// P02 오답: 방송 카드를 사람 동선(22:46)에 넣는다
const put = async (card: string, slot: string) => { await click(`#puzzle [data-token="${card}"]`); await click(`#puzzle [data-zone="${slot}"]`); };
await put('key_lost', 't2234'); await put('door_open', 't2241'); await put('sermon', 't2246');
const rc = await page.locator('#puzzle [data-token="return_room"]').first().boundingBox();
const z51 = await page.locator('#puzzle [data-zone="t2251"]').first().boundingBox();
await page.mouse.move(rc!.x + rc!.width / 2, rc!.y + rc!.height / 2); await page.mouse.down();
await page.mouse.move(z51!.x + z51!.width / 2, z51!.y + z51!.height / 2, { steps: 8 }); await page.mouse.up();
await wait(100);
await click('#puzzle [data-submit]'); await wait(60);
check((await noteText()) === '근거를 붙이지 않은 칸이 있다.' && (await page.locator('#puzzle .lnk.need').count()) === 4, '[P02] 근거를 붙이지 않으면 안내 하나 + 근거 칸 강조 (오답 아님)');
check(await cw<boolean>('!cw.state.wrongCountByPuzzle.P02_night_timeline'), '[P02] 오답 횟수는 그대로');
await attachLink(page, 't2234', 'E06_torn_sleeve'); await attachLink(page, 't2241', 'E05_access_log'); await attachLink(page, 't2246', 'choi_s_thud'); await attachLink(page, 't2251', 'E06_torn_sleeve');
await click('#puzzle [data-submit]'); await wait(60);
check((await warnLines()).length === 1 && (await warnLines())[0].includes('방송표와 맞지 않는다'), '[P02] 방송을 사람 동선에 넣으면 충돌 문장 하나 (복도 방송표와 맞지 않는다)');
check(await cw<boolean>('cw.state.wrongCountByPuzzle.P02_night_timeline === 1'), '[P02] 오답 1회 기록');
await noIds('[P02] 오답 화면');
await shot('stage5_p02');
// P02 정답: 키보드 (충돌음 카드를 22:46 칸에 → 방송 카드는 바깥으로 밀려난다)
await page.mouse.move(5, 5);
for (let i = 0; i < 12 && (await page.locator('#puzzle .tk.foc[data-token="thud"]').count()) === 0; i++) await press('ArrowLeft');
await press('Enter'); await press('ArrowRight', 3); await press('Enter');
check((await page.locator('#puzzle .zone.outside [data-token="sermon"]').count()) === 1, '[P02] 방송 카드는 “타임라인 바깥”으로 돌아간다');
await click('#puzzle [data-submit]'); await wait(100);
check(await cw<boolean>("cw.state.solvedPuzzleIds.includes('P02_night_timeline')"), '[P02] 정답 배열 + 근거 → 해결');
await press('Enter');
await page.waitForSelector('#dialogue'); await wait(60); await press('Enter');
const p2 = await page.locator('#dialogue .text').innerText();
check(p2.includes('정하늘이 원장실에 있었다') && !/계획|살인|의도/.test(p2), '[P02] 결과 문구는 “정하늘이 원장실에 있었다”까지만');
await mash();

// ---- 씬 4: 3층 ----
await teleport(1350); await wait(60); await press('Enter');
await page.waitForFunction(() => (window as any).__cw.scene.areaId === 'floor3' && !(window as any).__cw.scene.busy);
check(true, '[진행] P02 해결 후 2층 → 3층');

// 4-1 백선우
await enterRoom(315, 'room_baek');
await teleport(360); await wait(60);
check((await promptText()) === '', '[씬 4] 백선우가 거절하기 전에는 부원장 PC 를 볼 수 없다');
await talkTo(150); await press('Enter');
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
await click('#puzzle [data-chip="marked|position_changed"]'); await click('#puzzle [data-chip="marked|laceration_deleted"]'); await click('#puzzle [data-chip="marked|spelling_fix"]');
await click('#puzzle [data-submit]'); await wait(60);
check((await noteText()) === '근거를 붙이지 않은 칸이 있다.' && (await page.locator('#puzzle .lnk.need').count()) >= 1, '[P03] 근거를 붙이지 않으면 안내 하나 + 근거 칸 강조 (오답 아님)');
// 근거 고르기 목록: 가진 카드가 많아도 줄바꿈 + 최대 높이 + 스크롤이고, 선택한 줄이 항상 보인다
await click('#puzzle [data-link="marked"]'); await wait(100);
for (let i = 0; i < 16; i++) await press('ArrowDown');
await wait(150);
const pk = await page.evaluate(`(() => {
  var list = document.querySelector('#puzzle .lplist'), lb = list.getBoundingClientRect(), sel = document.querySelector('#puzzle .lrow.sel').getBoundingClientRect(), pickBox = document.querySelector('#puzzle .lpick').getBoundingClientRect(), box = document.querySelector('#puzzle').getBoundingClientRect();
  return { n: document.querySelectorAll('#puzzle .lrow').length, scrolls: list.scrollHeight > list.clientHeight, selVisible: sel.top >= lb.top - 4 && sel.bottom <= lb.bottom + 4, inside: pickBox.bottom <= box.bottom + 1 && pickBox.right <= box.right + 1 };
})()`) as { n: number; scrolls: boolean; selVisible: boolean; inside: boolean };
check(pk.n >= 15 && pk.scrolls && pk.inside, `[근거 목록] 가진 카드 ${pk.n - 1}장 전부 나오고, 목록은 화면 안에서 스크롤된다`);
check(pk.selVisible, '[근거 목록] 선택한 줄이 항상 보이는 영역 안에 있다 (자동 스크롤)');
await press('Escape'); await wait(100);
check((await page.locator('#puzzle .lpick').count()) === 0 && (await page.locator('#puzzle').count()) === 1, '[근거 목록] Esc 는 목록만 닫고 퍼즐은 그대로');
await attachCorrectLinks(page, 'P03_revision_diff');
await click('#puzzle [data-submit]'); await wait(60);
check((await warnLines()).length === 1 && (await warnLines())[0].includes('띄어쓰기') && !(await cw<boolean>("cw.state.solvedPuzzleIds.includes('P03_revision_diff')")), '[P03] 띄어쓰기 항목을 고르면 정답으로 인정하지 않고 충돌 문장 하나');
await noIds('[P03] 오답 화면');
await shot('stage5_p03');
await page.mouse.move(5, 5);
await focusOn('#puzzle .chip.foc[data-chip="marked|spelling_fix"]'); await press('Enter'); // 해제
await focusOn('#puzzle .chip.foc[data-chip="marked|breathing_changed"]'); await press('Enter');
await click('#puzzle [data-submit]'); await wait(100);
check(await cw<boolean>("cw.state.solvedPuzzleIds.includes('P03_revision_diff') && cw.state.verifiedEvidenceIds.includes('E07_report_revision')"), '[P03] 정답(키보드) → E07 검증');
await press('Enter'); await page.waitForSelector('#dialogue'); await mash();
await talkTo(150);
check(await until('의학적 판단이 아니라 문장을 지우셨군요.'), '[씬 4] E07 확보 뒤 백선우 후속 대사');
await mash();
await exitRoom('floor3');

// 4-2 오미란
await enterRoom(630, 'room_oh');
await talkTo(150); await press('Enter');
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
await page.waitForSelector('#viewer'); await closeViewer(); // 재고표 원문 (E05 는 2층 방송표에서 이미 얻었다)
check(await cw<boolean>("cw.state.evidenceIds.includes('E09_sedative_gap') && cw.state.verifiedEvidenceIds.includes('E05_access_log') && cw.state.verifiedEvidenceIds.includes('E06_torn_sleeve')"), '[씬 4] 재고표: E09·E05 (P02 를 이미 풀었으므로 E05 즉시 검증, E06 도 검증)');
await exitRoom('floor3');

// 4-3 이혜정
await enterRoom(945, 'room_lee');
await talkTo(150); await mash();
await teleport(340); await wait(60); await press('Enter');
await page.waitForSelector('#viewer'); await press('Enter'); await wait(200);
check((await docText()).includes('지하 보관 자료 동시 반출'), '[씬 4] 지시서 원문(E11)');
await closeViewer();
await page.waitForSelector('#puzzle', { timeout: 3000 });
check(true, '[P04] E10 + E11 → 자동 개방');
await noIds('[P04] 초기 화면');
const dragTo = async (token: string, zone: string) => {
  const a = await page.locator(`#puzzle [data-token="${token}"]`).first().boundingBox();
  const b = await page.locator(`#puzzle [data-zone="${zone}"]`).first().boundingBox();
  await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2); await page.mouse.down();
  await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2, { steps: 8 }); await page.mouse.up(); await wait(80);
};
await dragTo('doc_selection', 'lee_hanshin'); await dragTo('doc_approval', 'lee_hyejeong');
await dragTo('doc_schedule', 'baek_sunwoo'); await dragTo('doc_transfer', 'baek_sunwoo');
await click('#puzzle [data-submit]'); await wait(60);
check((await noteText()) === '근거를 붙이지 않은 칸이 있다.' && (await page.locator('#puzzle .lnk.need').count()) >= 1, '[P04] 근거를 붙이지 않으면 안내 하나 + 근거 칸 강조 (오답 아님)');
await attachCorrectLinks(page, 'P04_approval_chain');
await click('#puzzle [data-submit]'); await wait(60);
check((await warnLines()).length === 1 && (await warnLines())[0].includes('작성 약자와 맞지 않는다'), '[P04] LHJ/LHS 를 혼동하면 충돌 문장 하나 (위조 동의서 묶음의 작성 약자와 맞지 않는다)');
await noIds('[P04] 오답 화면');
await shot('stage5_p04');
await page.mouse.move(5, 5);
for (let i = 0; i < 12 && (await page.locator('#puzzle .tk.foc[data-token="doc_selection"]').count()) === 0; i++) await press('ArrowLeft');
await press('Enter'); await press('ArrowLeft'); await press('Enter'); // 선정표 → 이혜정
await press('ArrowRight'); await press('Enter'); await press('ArrowRight'); await press('Enter'); // 승인표 → 이한신
await press('ArrowRight', 2); await press('Enter'); await press('ArrowRight'); await press('Enter'); // 이송 지시서 → 이혜정 (백선우 칸에서 한 칸 뒤로 돌아 이혜정)
await click('#puzzle [data-submit]'); await wait(100);
check(await cw<boolean>("cw.state.solvedPuzzleIds.includes('P04_approval_chain') && cw.state.verifiedEvidenceIds.includes('E10_consent_forms')"), '[P04] 정답(키보드) → E10·E11 검증');
await press('Enter'); await page.waitForSelector('#dialogue'); await wait(60); await press('Enter');
check((await page.locator('#dialogue .text').innerText()).includes('선정은 이혜정, 승인은 이한신, 실행은 백선우'), '[P04] 중간 결론: 선정·승인·실행');
await press('Enter'); await wait(200); await press('Enter');
check((await page.locator('#dialogue .text').innerText()).includes('지하 계단으로 내려갈 수 있다'), '[진행] P03·P04 완료 → 지하 계단 개방 안내');
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
check((await page.locator('#puzzle').innerText()).includes('한유진의 진술') && (await page.locator('#puzzle').innerText()).includes('노란 실팔찌'), '[P05] 한유진 진술(ID)로 유품과 대조');
await noIds('[P05] 초기 화면');
await shot('stage6_p05_start');

// P05 오답: 후보 표에서 한유진을 고른다 (혈액형은 같다)
for (const k of ['ageMatch|eunji', 'ageMatch|unknown', 'bloodMatch|eunji', 'bloodMatch|yujin', 'admissionMatch|eunji', 'belongingMatch|eunji',
  'linkedSources|E12_ledger', 'linkedSources|E13_identity_map', 'linkedSources|E14_belongings_diary', 'linkedSources|han_s_bracelet']) await click(`#puzzle [data-chip="${k}"]`);
const tk5 = await page.locator('#puzzle [data-token="identity"]').first().boundingBox();
const row5 = await page.locator('#puzzle tr[data-zone="yujin"]').first().boundingBox();
await page.mouse.move(tk5!.x + tk5!.width / 2, tk5!.y + tk5!.height / 2); await page.mouse.down();
await page.mouse.move(row5!.x + 30, row5!.y + row5!.height / 2, { steps: 8 }); await page.mouse.up(); await wait(100);
await click('#puzzle [data-submit]'); await wait(60);
check((await noteText()) === '근거를 붙이지 않은 칸이 있다.' && (await page.locator('#puzzle .lnk.need').count()) >= 1, '[P05] 근거를 붙이지 않으면 안내 하나 + 근거 칸 강조 (오답 아님)');
await attachCorrectLinks(page, 'P05_patient_code');
await click('#puzzle [data-submit]'); await wait(60);
check((await warnLines()).length === 1 && (await warnLines())[0].includes('특별 치료 장부와 맞지 않는다'), '[P05] 오답: 충돌 문장 하나, 자료 이름으로 (특별 치료 장부와 맞지 않는다)');
check(!(await page.locator('#puzzle .warn').innerText()).includes('박은지'), '[P05] 오답 표시에 정답 이름이 없다');
await noIds('[P05] 오답 화면');
await shot('stage6_p05');
// 일기장만으로는 확정할 수 없다: 연결 자료를 일기장(보관함)만 남기면 오답
await click('#puzzle [data-chip="linkedSources|E12_ledger"]'); await click('#puzzle [data-chip="linkedSources|E13_identity_map"]'); await click('#puzzle [data-chip="linkedSources|han_s_bracelet"]');
await page.mouse.move(5, 5);
for (let i = 0; i < 40 && (await page.locator('#puzzle .tk.foc[data-token="identity"]').count()) === 0; i++) await press('ArrowLeft');
await press('Enter'); await press('ArrowLeft'); await press('Enter'); // 후보 행 → 박은지
await focusOn('#puzzle .submit.foc'); await press('Enter'); await wait(100);
check(await cw<boolean>("!cw.state.solvedPuzzleIds.includes('P05_patient_code')"), '[P05] 정답 후보라도 일기장(유품)만 연결하면 확정되지 않는다');
await click('#puzzle [data-chip="linkedSources|E12_ledger"]'); await click('#puzzle [data-chip="linkedSources|E13_identity_map"]'); await click('#puzzle [data-chip="linkedSources|han_s_bracelet"]');
await page.mouse.move(5, 5);
await focusOn('#puzzle .submit.foc'); await press('Enter'); await wait(100);
check(await cw<boolean>("cw.state.solvedPuzzleIds.includes('P05_patient_code') && cw.state.verifiedEvidenceIds.includes('E12_ledger') && cw.state.verifiedEvidenceIds.includes('E15_transport_manifest') && cw.state.flags.includes('flag_claim_d_open')"), '[P05] 해결 → E12~E15 검증, 질문 D 개방');
await press('Enter'); await page.waitForSelector('#dialogue'); await wait(60); await press('Enter'); await press('Enter'); // P05 결과 독백

// 정하늘 최종 대면 (일기장을 닫은 뒤 계단 쪽에서 등장, 2층 재방문 없음)
await page.waitForSelector('#dialogue', { timeout: 3000 });
check((await area()) === 'b1', '[씬 5] 정하늘은 지하에서 나타난다 (2층 재방문 없음)');
await until('명단에서 제 이름도 봤어요');
check((await page.locator('#dialogue .opt').count()) === 3, '[씬 5] 정하늘 최종 대면: 선택지 3개');
await noIds('[씬 5] 정하늘 대면');
await shot('stage6_haneul');
const optCount = async (n: number) => { for (let i = 0; i < 25 && (await page.locator('#dialogue .opt').count()) !== n; i++) { await press('Enter'); await wait(40); } };
await press('1'); await optCount(2);
check((await page.locator('#dialogue .opt').count()) === 2, '[씬 5] 들은 선택지는 사라진다');
await press('1'); await optCount(1); await press('1'); await optCount(1);
check((await page.locator('#dialogue .opt').innerText()).includes('계속'), '[씬 5] 세 선택지를 모두 듣고 나서 이어진다');
await press('Enter');
check(await until('당신이 민 힘으로 원장은 죽었습니다.'), '[씬 5] “당신이 민 힘으로 원장은 죽었습니다.”');
check(await until('제 손이 없어지는 건 아니니까.'), '[씬 5] 정하늘은 정당방위로 면죄를 주장하지 않는다');
check(await until('특별 치료 대상자 이송까지 15분 남았습니다.'), '[씬 5] 방송: 이송까지 15분');

// 씬 6: 증거 보존 선택
await press('Enter'); // 대화 끝 → 씬 6
await page.waitForSelector('#dialogue'); await wait(60);
check(await until('뭐든 찾았으면 먼저 보내 주세요.'), '[씬 6] 박은호 메시지');
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
// 질문 A~D 네 개를 사건 수첩 UI 에서 키보드로 직접 채운다 (시험 훅 사용 안 함)
const selText = async (sel: string) => (await page.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
const moveTo = async (sel: string, text: string, key = 'ArrowDown') => { for (let i = 0; i < 20 && !(await selText(sel)).includes(text); i++) await press(key); };
const claimsToFill: [string, string, string[], string][] = [
  ['claim_a', '기도대 충돌', ['기도대 아래 혈흔', '예비 검안 메모'], '검안 기록 수정 이력'],
  ['claim_b', '은지와 자신을 구하려', ['정하늘 손목띠 조각', '오미란의 수정 진술'], '원장실 출입 기록'],
  ['claim_c', '백선우와 이혜정이', ['검안 기록 수정 이력', '오미란의 수정 진술'], '찢어진 환자복 소매'],
  ['claim_d', 'P-271로 분류', ['특별 치료 장부', '박은지의 유품과 일기'], '생체 보존물 운송표'],
];
for (let i = 0; i < claimsToFill.length; i++) {
  const [cid, hyp, sup, reb] = claimsToFill[i];
  await press('Enter'); // 질문 i 의 사건 수첩 탭
  await page.waitForSelector('#notebook');
  await moveTo('#notebook .ndetail .row.sel', hyp); await press('Enter');
  const pick = async (slot: string, title: string) => { await moveTo('#notebook .ndetail .row.sel', slot); await press('Enter'); await moveTo('#notebook .picker .row.sel', title); await press('Enter'); };
  await pick('지지 근거 1', sup[0]); await pick('지지 근거 2', sup[1]); await pick('반박 근거', reb);
  await moveTo('#notebook .ndetail .row.sel', '[결론 저장]'); await press('Enter');
  check(await cw<boolean>(`!!cw.state.selectedHypothesisByClaim.${cid} && cw.state.submittedEvidenceByClaim.${cid}.length === 2 && cw.state.submittedRebuttalByClaim.${cid}.length === 1`), `[씬 7] 사건 수첩에서 키보드로 질문 ${'ABCD'[i]} 결론 저장 (시험 훅 없음)`);
  await press('Escape'); // 수첩 닫기 → 보고서
  await page.waitForSelector('#report');
  if (i < 3) await press('ArrowDown');
}
await press('ArrowDown'); // 보고 대상 행
await press('ArrowRight'); await press('ArrowRight'); // 박은호만 → 외부 수사기관 포함
await press('ArrowDown'); await press('Enter'); // 작성 내용 확인
await page.waitForFunction(() => document.querySelector('#report .sum'));
const sum = await page.locator('#report').innerText();
check(sum.includes('보고 대상: 외부 수사기관에도 보고한다') && sum.includes('기도대 충돌로 인한 후두부 손상'), '[씬 7] 제출 전 요약: 고른 결론과 보고 대상을 문장으로 다시 보여 준다');
check(!/정답|오답|해결|엔딩|맞았|틀렸/.test(sum), '[씬 7] 요약은 정답·해결 여부·예상 엔딩을 암시하지 않는다');
await noIds('[씬 7] 요약');
await shot('stage6_report');
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
check(!gr.includes('보고서 다시 쓰기'), '[엔딩 A] 다른 엔딩은 “처음부터”와 “타이틀로”만');
await press('ArrowDown'); await press('Enter');
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
  await press('ArrowUp'); await press('ArrowDown');
  await press('ArrowDown', 3); await press('ArrowDown');
  await press('ArrowRight'); if (opts.target === 'external') await press('ArrowRight');
  await press('ArrowDown'); await press('Enter');
  await page.waitForFunction(() => document.querySelector('#report .sum'));
  await press('Enter');
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
check(!(await page.locator('#ending').innerText()).includes('보고서 다시 쓰기'), '[엔딩 C] 처음부터 / 타이틀로만');

// 엔딩 D → 보고서 다시 쓰기 → 엔딩 A
await jump();
await until('뭐든 찾았으면 먼저 보내 주세요.'); await press('Enter');
await until('이 선택은 되돌릴 수 없다.');
await press('1'); await wait(60); await press('Enter'); await press('Enter');
await finishReport({ good: ['claim_c', 'claim_d'], target: 'external' }); // 질문 A·B 오답
check((await page.locator('#ending').innerText()).includes('자연사'), '[엔딩 D] 질문 2개 오답');
await press('Enter');
check((await page.locator('#ending').innerText()).includes('보고서 다시 쓰기'), '[엔딩 D] 재도전 선택지');
await shot('stage6_ending_d');
await press('Enter'); // 보고서 다시 쓰기
await page.waitForSelector('#report', { timeout: 3000 });
check(await cw<boolean>("cw.state.retryClaimIds.length === 2 && cw.state.evidenceSecured && !cw.state.selectedHypothesisByClaim.claim_a"), '[엔딩 D] 씬 7 시작 시점으로 돌아간다 (이전 제출 내용은 없고, 미해결 질문 2개가 기록됨)');
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
check(Math.abs(gap2 - 56) <= 1 && (await page.locator('#dialogue .name').innerText()) === '박은호', '[건너뛰기] 건너뛰어도 박은호는 플레이어 앞 56px 에 서 있고 대화가 시작된다');
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

await browser.close();
check(errors.length === 0, `콘솔 오류 0 ${errors.join(' | ')}`);
if (fails.length) { console.error(`\nFAIL ${fails.length}건`); process.exit(1); }
console.log('\nE2E OK');
