// e2e: 테스트 전용 대사를 포함한 file:// 빌드(mode=e2e)를 열어 검증한다.
//  A. 시스템 시험 (테스트 전용 대사): 근접 조사, 선택지, 단서 제시, 진술 3단계, 층 이동, 사건 수첩
//  B. 이야기 시험 (새 게임, 실제 대사): 씬 1 → 씬 2 → P01 → 2층 계단 개방
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
const click = (sel: string) => page.locator(sel).first().click();
const shot = async (name: string) => { if (SHOT) await page.screenshot({ path: `docs/screenshots/${name}.png` }); };
// 화면 텍스트에 내부 ID(영문 snake_case, E01 같은 단서 코드, 플래그 이름)가 나오면 안 된다
const ID_RE = /[a-z]+(?:_[a-z0-9]+)+|\bE\d{2}\b|\bP0\d\b|flag_|trigger_fired|puzzle_opened|cutscene_done/;
const noIds = async (where: string) => {
  const t = await page.locator('#ui').innerText();
  const m = t.match(ID_RE);
  check(!m, `${where}: 내부 ID 노출 없음${m ? ' → ' + m[0] : ''}`);
};
async function enterArea(x: number, expect: string) {
  await teleport(x); await wait(60);
  await press('Enter');
  await page.waitForFunction((a) => (window as any).__cw.scene.areaId === a && !(window as any).__cw.scene.busy, expect, { timeout: 3000 });
}

await page.goto(url);
await page.waitForFunction(() => (window as any).__cw?.scene?.player, null, { timeout: 10000 });
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
await press('ArrowRight'); await press('Enter');
check(await page.locator('#closeup-detail').isVisible(), '키보드로 확대 보기 (←→ Enter)');
await wait(60);
await press('Enter'); await press('Enter'); // 한 줄 독백 (타이핑 완성 → 끝)
await page.waitForFunction(() => !document.querySelector('#dialogue'));
await press('Escape'); await press('Escape');
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
await page.goto(url);
await page.waitForFunction(() => (window as any).__cw?.scene?.player, null, { timeout: 10000 });
check((await area()) === 'office', '[이야기] 새 게임은 사무실에서 시작');
const mash = async () => { for (let i = 0; i < 80; i++) { if (!(await page.locator('#dialogue').count())) return; await press('Enter'); await wait(30); } };
const docText = async () => (await page.locator('#viewer').innerText()).replace(/\s+/g, ' ');
const closeViewer = async () => { await press('Enter'); await page.waitForFunction(() => !document.querySelector('#viewer')); };

// ---- 씬 1 ----
await teleport(540); await wait(60);
check((await promptText()) === '', '[씬 1] 의뢰를 듣기 전에는 문이 잠겨 있다');
await teleport(11 * 45 - 25); await wait(60);
check((await promptText()).includes('대화하기'), '[씬 1] 박은호 앞에서 "대화하기" 프롬프트');
await press('Enter');
await page.waitForSelector('#dialogue');
await wait(60);
const px = await cw<number>('cw.scene.player.x');
check(Math.abs(px - 495) >= 56, '[씬 1] 대화 시작 시 중심 간격 56px 이상');
check(await cw<boolean>('!cw.scene.playerFacesLeft()'), '[씬 1] 대화 시작 시 서로 마주 봄 (플레이어는 오른쪽을 본다)');
await press('Enter'); // 타이핑 완성
check((await page.locator('#dialogue .text').innerText()).includes('병원은 은지가 치료 중이라고만 합니다'), '[씬 1] 첫 대사는 기획서 문장');
await noIds('[씬 1] 대화창');
await shot('stage4_scene1_dialogue');
await mash();
await page.waitForSelector('#viewer');
check((await docText()).includes('하늘 언니가 다음 명단에 내 이름이 있다고 했어'), '[씬 1] 편지 전문(E01)이 HTML 로 표시된다');
check((await page.locator('#viewer .docbg').count()) === 1, '[씬 1] 편지 일러스트(item_letter)가 배경');
await noIds('[씬 1] 편지');
await shot('stage4_letter');
await closeViewer();
check(await cw<boolean>("cw.state.evidenceIds.includes('E01_last_letter') && cw.state.evidenceIds.length === 1"), '[씬 1] E01 획득');

await teleport(67.5); await wait(60); await press('Enter');
await page.waitForSelector('#closeup');
await press('ArrowRight'); await press('Enter'); await wait(60); await press('Enter');
check((await page.locator('#dialogue .text').innerText()).includes('8월 17일. 은호 씨와 약속한 날이다.'), '[씬 1] 캘린더 문구');
await mash(); await press('Escape'); await press('Escape');
check(await cw<boolean>('cw.state.evidenceIds.length === 1'), '[씬 1] 캘린더는 단서로 등록되지 않는다');

await teleport(540); await wait(60);
check((await promptText()).includes('들어가기'), '[씬 1] 의뢰 후 문이 열린다');
await press('Enter');
await page.waitForSelector('#cutscene', { timeout: 3000 });
check(true, '[씬 1] 병원 도착 컷신');
await wait(500); await noIds('[컷신]');
await press('Enter');
await page.waitForFunction(() => (window as any).__cw.scene.areaId === 'floor1' && !(window as any).__cw.scene.busy, null, { timeout: 4000 });
check(true, '[씬 2] 컷신 후 1층');

// ---- 씬 2 ----
await page.keyboard.down('Shift'); await page.keyboard.down('ArrowRight');
await page.waitForSelector('#dialogue', { timeout: 5000 });
await page.keyboard.up('ArrowRight'); await page.keyboard.up('Shift');
await wait(60); await press('Enter');
check((await page.locator('#dialogue .text').innerText()).includes('오늘 새벽 원장님께서 지병으로 돌아가셨습니다'), '[씬 2] 백선우 도착 대사 (자동 트리거)');
check(await cw<boolean>("cw.state.statements.baek_s_natural?.stage === 'unconfirmed'"), '[씬 2] 백선우의 진술이 수첩에 미확인으로 기록');
await mash();
await wait(100);
check(await cw<boolean>("cw.state.flags.includes('baek_left')"), '[씬 2] 백선우가 자리를 비운다');

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
await page.waitForSelector('#puzzle', { timeout: 3000 });
check(true, '[P01] 세 자료가 등록되면 평면도가 자동으로 열린다');
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
await click('#puzzle [data-chip="body"]'); await click('#puzzle [data-chip="chair"]');
await click('#puzzle [data-submit]');
await wait(60);
const warn = await page.locator('#puzzle .warn').innerText();
check(warn.includes('기도대 아래 혈흔 위치와 맞지 않는다'), '[P01] 오답: 충돌하는 자료 항목만 표시');
check(!warn.includes('기도대 옆 바닥') && !warn.includes('최종 보고서'), '[P01] 오답 표시에 정답을 알려주지 않는다');
check(await cw<boolean>("cw.state.wrongCountByPuzzle.P01_scene_rebuild === 1 && !cw.state.solvedPuzzleIds.includes('P01_scene_rebuild')"), '[P01] 오답 1회 기록');
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
await press('ArrowLeft'); await press('ArrowLeft'); await press('Enter'); // [확인]
await wait(100);
check(await cw<boolean>("cw.state.solvedPuzzleIds.includes('P01_scene_rebuild') && cw.state.flags.includes('flag_scene_rebuilt')"), '[P01] 정답 → 해결, 현장 재구성 플래그');
check(await cw<boolean>("cw.state.verifiedEvidenceIds.includes('E02_altar_blood') && cw.state.verifiedEvidenceIds.includes('E03_preliminary_exam')"), '[P01] E02·E03 검증됨');
await press('Enter');
await page.waitForSelector('#dialogue');
await wait(60); await press('Enter');
const mid = await page.locator('#dialogue .text').innerText();
check(mid.includes('누군가 시신을 옮겼다') && !mid.includes('정하늘'), '[P01] 중간 결론만: 누군가 시신을 옮겼다 (옮긴 사람·정하늘은 확정하지 않는다)');
await mash();

await teleport(360); await wait(60); await press('Enter');
await page.waitForFunction(() => (window as any).__cw.scene.areaId === 'floor1' && !(window as any).__cw.scene.busy);
await teleport(1620); await wait(60); await press('Enter');
await page.waitForFunction(() => (window as any).__cw.scene.areaId === 'floor2' && !(window as any).__cw.scene.busy);
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
const focusOn = async (sel: string) => { for (let i = 0; i < 16 && (await page.locator(sel).count()) === 0; i++) await press('ArrowRight'); };
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
check(await cw<boolean>("cw.state.evidenceIds.includes('E06_torn_sleeve')"), '[씬 3] 채소연: E06 증언 획득');
check((await page.locator('#puzzle').count()) === 0, '[씬 3] 방송표를 보기 전에는 P02 가 열리지 않는다');

// 정하늘 1차 대면
await talkTo(370);
check(await cw<boolean>("cw.state.flags.includes('haneul_met')"), '[씬 3] 정하늘 대화가 시작되면 E04 공개 플래그');
await until('모릅니다.');
await pickEvidence(3);
check((await page.locator('#dialogue').innerText()).includes('정하늘 손목띠 조각'), '[씬 3] 대면 후 E04 표시 이름이 “정하늘 손목띠 조각”');
await noIds('[씬 3] 단서 제시 선택기');
await press('Enter');
await until('그 방에 들어간 적 없어요');
check(await cw<boolean>("cw.state.statements.haneul_s_denial?.stage === 'unconfirmed'"), '[씬 3] “그 방에 들어간 적 없어요”는 진술로만 기록(유죄 단서 아님)');
await mash();
await talkTo(370);
await until('…더 말하면 저도 없어져요.');
await press('Enter'); await wait(80);
check((await page.locator('#dialogue').count()) === 0, '[씬 3] 반복 추궁해도 대화가 늘어나지 않는다');
await exitRoom('floor2');

// 방송표 → P02
await teleport(1080); await wait(60);
check((await promptText()).includes('복도 방송표'), '[씬 3] 복도 방송표 조사 지점');
await press('Enter');
await page.waitForSelector('#dialogue'); await wait(60); await press('Enter');
check((await page.locator('#dialogue .text').innerText()).includes('예약 재생'), '[씬 3] 방송표: 예약 재생');
await mash();
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
check((await page.locator('#puzzle .warn').innerText()).includes('시간이 충돌한다'), '[P02] 방송을 사람 동선에 넣으면 시간 충돌을 표시');
check(await cw<boolean>('cw.state.wrongCountByPuzzle.P02_night_timeline === 1'), '[P02] 오답 1회 기록');
await noIds('[P02] 오답 화면');
await shot('stage5_p02');
// P02 정답: 키보드 (충돌음 카드를 22:46 칸에 → 방송 카드는 바깥으로 밀려난다)
await page.mouse.move(5, 5);
for (let i = 0; i < 12 && (await page.locator('#puzzle .tk.foc[data-token="thud"]').count()) === 0; i++) await press('ArrowLeft');
await press('Enter'); await press('ArrowRight', 3); await press('Enter');
check((await page.locator('#puzzle .zone.outside [data-token="sermon"]').count()) === 1, '[P02] 방송 카드는 “타임라인 바깥”으로 돌아간다');
await focusOn('#puzzle .submit.foc');
await press('Enter'); await wait(100);
check(await cw<boolean>("cw.state.solvedPuzzleIds.includes('P02_night_timeline')"), '[P02] 정답(키보드) → 해결');
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
await pickEvidence(1); await press('Enter'); // E03 제시
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
await click('#puzzle [data-chip="position_changed"]'); await click('#puzzle [data-chip="laceration_deleted"]'); await click('#puzzle [data-chip="spelling_fix"]');
await click('#puzzle [data-submit]'); await wait(60);
check((await page.locator('#puzzle .warn').count()) === 1 && !(await cw<boolean>("cw.state.solvedPuzzleIds.includes('P03_revision_diff')")), '[P03] 맞춤법 항목을 고르면 정답으로 인정하지 않고 충돌 표시');
await noIds('[P03] 오답 화면');
await shot('stage5_p03');
await page.mouse.move(5, 5);
await focusOn('#puzzle .chip.foc[data-chip="spelling_fix"]'); await press('Enter'); // 해제
await focusOn('#puzzle .chip.foc[data-chip="breathing_changed"]'); await press('Enter');
await focusOn('#puzzle .submit.foc'); await press('Enter'); await wait(100);
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
await pickEvidence(1); await press('Enter'); // E03
check(await cw<boolean>("cw.state.statements.oh_s_first.stage === 'contradiction'"), '[씬 4] E03 제시 → 오미란 진술이 모순으로');
await until('…제가 잘못 적었습니다.');
await pickEvidence(3); await press('ArrowDown'); await press('Space'); // E04 + E06
await press('Enter');
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
await page.waitForSelector('#viewer'); await press('Enter'); await wait(200); await closeViewer(); // 원문 두 개를 차례로
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
check((await page.locator('#puzzle .warn').innerText()).includes('선정 권한과 승인 권한이 충돌'), '[P04] LHJ/LHS 를 혼동하면 선정·승인 권한 충돌 표시');
await noIds('[P04] 오답 화면');
await shot('stage5_p04');
await page.mouse.move(5, 5);
for (let i = 0; i < 12 && (await page.locator('#puzzle .tk.foc[data-token="doc_selection"]').count()) === 0; i++) await press('ArrowLeft');
await press('Enter'); await press('ArrowLeft'); await press('Enter'); // 선정표 → 이혜정
await press('ArrowRight'); await press('Enter'); await press('ArrowRight'); await press('Enter'); // 승인표 → 이한신
await focusOn('#puzzle .submit.foc'); await press('Enter'); await wait(100);
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

await browser.close();
check(errors.length === 0, `콘솔 오류 0 ${errors.join(' | ')}`);
if (fails.length) { console.error(`\nFAIL ${fails.length}건`); process.exit(1); }
console.log('\nE2E OK');
