import { describe, expect, it } from 'vitest';
import real from '../src/data/dialogue.json';
import {
  acquireEvidence, condMet, createGameState, enterNode, getNode, hasFlag, isBasementOpen, presentEvidence, puzzles, shownEvidence,
  startNodeOf, submitPuzzle, type Dialogues, type GameState,
} from '../src/core';
import { areas, isAvailable, nearest } from '../src/explore/interaction';

const D = real.dialogues as unknown as Dialogues;
const find = (area: string, id: string) => areas[area].interactables.find((i) => i.id === id)!;
const walk = (s: GameState, id: string, from: string) => { let n = from; for (let i = 0; i < 30 && n; i++) { const node = getNode(D, id, n); enterNode(s, node); n = node.next ?? ''; } };
const P = (id: string) => puzzles.find((p) => p.id === id)!;

describe('씬 3 병동', () => {
  it('2층 → 3층 계단은 P02 해결 전 잠겨 있고 이유 독백이 있다', () => {
    const s = createGameState(), st = find('floor2', 'stairs_up');
    expect(isAvailable(st, s)).toBe(false);
    expect(nearest(areas.floor2, st.x, s)?.id).toBe('stairs_up');
    submitPuzzle(s, 'P02_night_timeline', P('P02_night_timeline').correctSlots);
    expect(isAvailable(st, s)).toBe(true);
  });
  it('최옥자: 진술 등록(단서 아님), 선택지 2개, 방송표를 보면 모순 단계로', () => {
    const s = createGameState();
    enterNode(s, D.choi_okja.nodes.c1);
    expect(D.choi_okja.nodes.c1.choices).toHaveLength(2);
    expect(s.statements.choi_s_prayer.stage).toBe('unconfirmed');
    expect(s.evidenceIds).toEqual([]);
    enterNode(s, D.mono_broadcast.nodes.m);
    expect(s.statements.choi_s_prayer.stage).toBe('contradiction');
    expect(hasFlag(s, 'broadcast_seen')).toBe(true);
  });
  it('한유진: 단서 ID 없이 진술 2개 (은지 이송 · 노란 실팔찌)', () => {
    const s = createGameState();
    walk(s, 'han_yujin', 'y1');
    expect(Object.keys(s.statements).sort()).toEqual(['han_s_bracelet', 'han_s_transfer']);
    expect(s.evidenceIds).toEqual([]);
  });
  it('채소연: E06 획득, P02 해결 전엔 미검증', () => {
    const s = createGameState();
    walk(s, 'chae_soyeon', 's1');
    expect(s.evidenceIds).toEqual(['E06_torn_sleeve']);
    expect(s.verifiedEvidenceIds).toEqual([]);
  });
  it('P02 열림 조건: 최옥자·채소연 대화 + 방송표 (E05 와 무관)', () => {
    const w = P('P02_night_timeline').openWhen!;
    expect(w.flags).toEqual(['choi_done', 'han_done', 'chae_done', 'broadcast_seen']); // 한유진 대화는 지하 이전 필수 (12.3.3)
    expect(w.evidence ?? []).toEqual([]);
  });
  it('E05 는 3층에서 얻고, P02 를 이미 풀었으면 얻는 즉시 검증', () => {
    const s = createGameState();
    submitPuzzle(s, 'P02_night_timeline', P('P02_night_timeline').correctSlots);
    acquireEvidence(s, 'E05_access_log');
    expect(s.verifiedEvidenceIds).toContain('E05_access_log');
  });
  it('정하늘 1차 대면: 시작하면 E04 이름 공개, 부정은 진술로만, 반복 추궁해도 대화가 늘지 않는다', () => {
    const s = createGameState(); acquireEvidence(s, 'E04_wristband_fragment');
    expect(shownEvidence(s, 'E04_wristband_fragment')!.title).not.toContain('정하늘');
    enterNode(s, D.jeong_haneul.nodes.h1);
    expect(shownEvidence(s, 'E04_wristband_fragment')!.title).toBe('정하늘 손목띠 조각');
    expect(startNodeOf(s, D.jeong_haneul)).toBe('h4');
    expect(presentEvidence(s, D.jeong_haneul, 'jeong_haneul', 'h4', ['E04_wristband_fragment'])).toEqual({ kind: 'ok', next: 'h5' });
    walk(s, 'jeong_haneul', 'h5');
    expect(s.statements.haneul_s_denial.stage).toBe('unconfirmed'); // 유죄 단서 아님: 모순 단계로도 바뀌지 않는다
    expect(startNodeOf(s, D.jeong_haneul)).toBe('h8');
    expect(D.jeong_haneul.nodes.h8.next).toBeUndefined(); // 더 이어지지 않는다
  });
});

describe('씬 4 관계자 구역', () => {
  it('백선우: E03 제시 → 기존 진술이 모순 → 거절 → PC 에서 E07(미검증) → 후속 대사', () => {
    const s = createGameState();
    enterNode(s, getNode(D, 'baek_lobby', 'b1'));
    acquireEvidence(s, 'E03_preliminary_exam');
    expect(isAvailable(find('room_baek', 'revision'), s)).toBe(false);
    enterNode(s, D.baek_office.nodes.k1);
    expect(presentEvidence(s, D.baek_office, 'baek_office', 'k1', ['E03_preliminary_exam'])).toEqual({ kind: 'ok', next: 'k2' });
    expect(s.statements.baek_s_natural.stage).toBe('contradiction');
    walk(s, 'baek_office', 'k2');
    expect(hasFlag(s, 'baek_refused')).toBe(true);
    expect(isAvailable(find('room_baek', 'revision'), s)).toBe(true);
    acquireEvidence(s, 'E07_report_revision');
    expect(s.verifiedEvidenceIds).not.toContain('E07_report_revision');
    expect(startNodeOf(s, D.baek_office)).toBe('k6');
  });
  it('P03 열림 조건 E03 + E07, 해결하면 E07 검증, 맞춤법·문장 순서는 정답이 아니다', () => {
    expect(P('P03_revision_diff').openWhen!.evidence).toEqual(['E03_preliminary_exam', 'E07_report_revision']);
    const s = createGameState(); acquireEvidence(s, 'E03_preliminary_exam'); acquireEvidence(s, 'E07_report_revision');
    const bad = submitPuzzle(s, 'P03_revision_diff', { marked: ['position_changed', 'laceration_deleted', 'spelling_fix'] });
    expect(bad.status).toBe('wrong');
    expect(bad.conflicts).toHaveLength(1);
    expect(submitPuzzle(s, 'P03_revision_diff', P('P03_revision_diff').correctSlots).status).toBe('solved');
    expect(s.verifiedEvidenceIds).toContain('E07_report_revision');
  });
  it('오미란: 핵심 수정 증언은 E04+E06 정확히 둘이 있어야 열린다, 수정 진술 → E08', () => {
    const s = createGameState();
    for (const id of ['E03_preliminary_exam', 'E04_wristband_fragment', 'E06_torn_sleeve']) acquireEvidence(s, id);
    enterNode(s, D.oh_miran.nodes.o1);
    expect(presentEvidence(s, D.oh_miran, 'oh_miran', 'o1', ['E04_wristband_fragment']).kind).toBe('none');
    expect(presentEvidence(s, D.oh_miran, 'oh_miran', 'o1', ['E03_preliminary_exam']).kind).toBe('ok');
    expect(s.statements.oh_s_first.stage).toBe('contradiction');
    walk(s, 'oh_miran', 'o2'); // o3: 잘못 적었습니다 — 거기서 멈춘다
    expect(presentEvidence(s, D.oh_miran, 'oh_miran', 'o3', ['E06_torn_sleeve']).kind).toBe('none');
    expect(presentEvidence(s, D.oh_miran, 'oh_miran', 'o3', ['E04_wristband_fragment', 'E06_torn_sleeve']).kind).toBe('ok');
    walk(s, 'oh_miran', 'o4');
    expect(s.statements.oh_s_first.stage).toBe('revised');
    expect(s.evidenceIds).toContain('E08_miran_revised');
  });
  it('재고표 한 곳에서 E09·E05, 이혜정 책상 한 곳에서 E10·E11', () => {
    expect((find('room_oh', 'stock') as { evidenceIds: string[] }).evidenceIds).toEqual(['E09_sedative_gap', 'E05_access_log']);
    expect((find('room_lee', 'desk') as { evidenceIds: string[] }).evidenceIds).toEqual(['E10_consent_forms', 'E11_transfer_order']);
  });
  it('P04: 문서 4종·인물 3, LHJ/LHS 혼동 시 권한 충돌, 해결하면 E10·E11 검증', () => {
    const p = P('P04_approval_chain');
    expect(p.tasks).toHaveLength(4);
    expect(p.zones).toHaveLength(3);
    const s = createGameState(); acquireEvidence(s, 'E10_consent_forms'); acquireEvidence(s, 'E11_transfer_order');
    const swapped = submitPuzzle(s, 'P04_approval_chain', { ...p.correctSlots, doc_selection: ['lee_hanshin'], doc_approval: ['lee_hyejeong'] });
    expect(swapped.status).toBe('wrong');
    expect(swapped.conflicts.join()).toContain('선정 권한과 승인 권한이 충돌');
    expect(submitPuzzle(s, 'P04_approval_chain', p.correctSlots).status).toBe('solved');
    expect(s.verifiedEvidenceIds).toEqual(expect.arrayContaining(['E10_consent_forms', 'E11_transfer_order']));
  });
  it('지하 계단은 P03 과 P04 가 모두 풀려야 열린다', () => {
    const s = createGameState();
    submitPuzzle(s, 'P03_revision_diff', P('P03_revision_diff').correctSlots);
    expect(isBasementOpen(s)).toBe(false);
    submitPuzzle(s, 'P04_approval_chain', P('P04_approval_chain').correctSlots);
    expect(isBasementOpen(s)).toBe(true);
    expect(condMet(s, '@basement_open')).toBe(true);
  });
});

describe('P02 시간 배열', () => {
  it('방송 카드를 사람 동선(시간 칸)에 넣으면 시간 충돌, 타임라인 바깥에 두면 정답', () => {
    const p = P('P02_night_timeline');
    const s = createGameState();
    const r = submitPuzzle(s, p.id, { t2234: ['key_lost'], t2241: ['door_open'], t2246: ['sermon'], t2251: ['return_room'] });
    expect(r.status).toBe('wrong');
    expect(r.conflicts.join()).toContain('시간이 충돌');
    expect(p.tokens).toHaveLength(5);
    expect(Object.values(p.correctSlots).flat()).not.toContain('sermon');
    expect(submitPuzzle(s, p.id, p.correctSlots).status).toBe('solved');
    expect(hasFlag(s, 'flag_night_timeline')).toBe(true);
  });
  it('결과 문구는 정하늘이 원장실에 있었다까지만, 계획 살인 여부는 말하지 않는다', () => {
    const t = D.mono_p02_solved.nodes.m.text;
    expect(t).toContain('정하늘이 원장실에 있었다');
    expect(t).not.toMatch(/계획|살인|살해|의도/);
  });
});

describe('씬 3·4 대사 출처', () => {
  it('모든 노드에 source 가 있다', () => {
    for (const d of Object.values(D)) for (const n of Object.values(d.nodes)) expect(['spec', 'new', 'craft_on']).toContain(n.source);
  });
});

describe('5단계 보완', () => {
  it('P04: 인물 노드에 약자가 없고 이름·역할만 있다, 정답은 선정표·이송 지시서 → 이혜정', () => {
    const p = P('P04_approval_chain');
    for (const z of p.zones!) { expect(z.label).not.toMatch(/LH|BSW|\(/); expect(z.sub).toBeTruthy(); }
    expect(p.correctSlots).toEqual({ doc_selection: ['lee_hyejeong'], doc_approval: ['lee_hanshin'], doc_schedule: ['baek_sunwoo'], doc_transfer: ['lee_hyejeong'] });
    const transfer = p.tasks!.find((t) => t.slot === 'doc_transfer')!;
    expect(transfer.detail).toBe('서명: 이혜정 · 권한: 이송 지시');
    expect(JSON.stringify(p.tasks)).not.toContain('BSW_ADMIN');
    const s = createGameState();
    expect(submitPuzzle(s, p.id, { ...p.correctSlots, doc_transfer: ['baek_sunwoo'] }).status).toBe('wrong');
  });
  it('P03: 예비 기록·수정 이력 패널은 E03·E07 원문을 참조하고, 띄어쓰기·문장 위치 방해 항목이 성립한다', () => {
    const p = P('P03_revision_diff');
    expect(p.panels!.filter((x) => x.evidenceId).map((x) => x.evidenceId)).toEqual(['E03_preliminary_exam', 'E07_report_revision']);
    expect(p.panels!.filter((x) => x.evidenceId).every((x) => !x.lines)).toBe(true);
    const e03 = shownEvidence(createGameState(), 'E03_preliminary_exam')!.body!;
    const fin = p.panels!.find((x) => x.title === '최종 기록')!.lines!;
    expect(e03).toContain('의식없음, 미약 호흡');
    expect(fin).toContain('의식 없음, 발견 당시 사망');
    expect(e03[e03.length - 1]).toBe('※ 부원장 재검토 요청');
    expect(fin[0]).toBe('※ 부원장 재검토 요청'); // 문장 위치 이동
  });
  it('E01 원문 끝에 봉투 정보(입원번호 EW-0827)가 있고 새 문장으로 표시된다', () => {
    const e = shownEvidence(createGameState(), 'E01_last_letter')!;
    expect(e.body![e.body!.length - 1]).toBe('봉투 발신: 은혜요양병원 2병동 · 입원번호 EW-0827 · 박은지');
    expect(e.newText).toEqual([e.body![e.body!.length - 1]]);
  });
});
