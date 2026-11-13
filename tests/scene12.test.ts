import { describe, expect, it } from 'vitest';
import real from '../src/data/dialogue.json';
import { acquireEvidence, createGameState, enterNode, getNode, hasFlag, puzzleById, quizConclusion, quizWalk, shownEvidence, type Dialogues } from '../src/core';
import { submitPuzzle } from './helpers';
import { areas, isAvailable, nearest } from '../src/explore/interaction';

const D = real.dialogues as unknown as Dialogues;
const find = (area: string, id: string) => areas[area].interactables.find((i) => i.id === id)!;
const P = 'P01_scene_rebuild';
const ok = { path: ['c1_head', 'c2_fight', 'c3_altar', 'c4_moved'] };

describe('씬 1·2 진행 조건', () => {
  it('사무실 문은 박은호 대화(intro_done) 후, 원장실 문과 검안 메모는 백선우가 떠난 뒤', () => {
    const s = createGameState();
    expect(isAvailable(find('office', 'door_out'), s)).toBe(false);
    expect(isAvailable(find('floor1', 'door_director'), s)).toBe(false);
    expect(isAvailable(find('floor1', 'exam_note'), s)).toBe(false);
    enterNode(s, getNode(D, 'eunho_intro', 'n7'));
    expect(hasFlag(s, 'intro_done')).toBe(true);
    expect(s.evidenceIds).toContain('E01_last_letter');
    enterNode(s, getNode(D, 'baek_lobby', 'b6'));
    expect(isAvailable(find('floor1', 'door_director'), s)).toBe(true);
    expect(isAvailable(find('floor1', 'exam_note'), s)).toBe(true);
  });
  it('2층 계단은 P01 해결 전에는 잠겨 있고 이유 독백이 있다 (프롬프트는 뜬다)', () => {
    const s = createGameState(), st = find('floor1', 'stairs_up');
    expect(isAvailable(st, s)).toBe(false);
    expect(nearest(areas.floor1, st.x, s)?.id).toBe('stairs_up');
    for (const id of ['E02_altar_blood', 'E03_preliminary_exam', 'E04_wristband_fragment']) acquireEvidence(s, id);
    submitPuzzle(s, P, ok);
    expect(isAvailable(st, s)).toBe(true);
  });
  it('평면도는 세 자료가 모두 등록되어야 열린다', () => {
    const s = createGameState(), plan = find('room_director', 'plan');
    acquireEvidence(s, 'E02_altar_blood'); acquireEvidence(s, 'E03_preliminary_exam');
    expect(isAvailable(plan, s)).toBe(false);
    acquireEvidence(s, 'E04_wristband_fragment');
    expect(isAvailable(plan, s)).toBe(true);
  });
  it('백선우는 대화 후 사라진다(자동 트리거도 끝)', () => {
    const s = createGameState();
    enterNode(s, getNode(D, 'baek_lobby', 'b6'));
    expect(nearest(areas.floor1, find('floor1', 'baek').x, s)).toBeNull();
  });
  it('독백 노드가 단서를 준다: 기도대 E02, 책상 아래 E04', () => {
    const s = createGameState();
    enterNode(s, D.mono_altar.nodes.m); enterNode(s, D.mono_wristband.nodes.m);
    expect(s.evidenceIds).toEqual(['E02_altar_blood', 'E04_wristband_fragment']);
  });
  it('E04 는 즉시 검증, E02·E03 은 P01 해결 전까지 미검증, 해결하면 검증', () => {
    const s = createGameState();
    for (const id of ['E02_altar_blood', 'E03_preliminary_exam', 'E04_wristband_fragment']) acquireEvidence(s, id);
    expect(s.verifiedEvidenceIds).toEqual(['E04_wristband_fragment']);
    submitPuzzle(s, P, ok);
    expect(s.verifiedEvidenceIds.sort()).toEqual(['E02_altar_blood', 'E03_preliminary_exam', 'E04_wristband_fragment']);
    expect(hasFlag(s, 'flag_scene_rebuilt')).toBe(true);
  });
  it('E04 는 이름을 드러내지 않는다 (정하늘 노출 금지)', () => {
    const s = createGameState();
    const e = shownEvidence(s, 'E04_wristband_fragment')!;
    expect(e.sourceCharacterId).toBe('');
    expect(JSON.stringify(e)).not.toContain('정하늘');
    s.flags.push('haneul_met'); // 정하늘 1차 대면 후
    const r = shownEvidence(s, 'E04_wristband_fragment')!;
    expect(r.title).toBe('정하늘 손목띠 조각');
    expect(r.sourceCharacterId).toBe('jeong_haneul');
  });
});

describe('P01 오답 표시', () => {
  const sub = (a: object) => submitPuzzle(createGameState(), P, a as never);
  it('틀린 판단도 한 번 확정하면 같은 결과(settled)이고 충돌 문장·힌트는 없다', () => {
    const s = createGameState(), r = submitPuzzle(s, P, { path: ['c1_head', 'c2_seizure', 'c3_altar', 'c4_moved'] });
    expect(r).toEqual({ status: 'settled' }); expect(s.failedPuzzleIds).toEqual([P]);
  });
  it('지병을 고르면 다른 질문으로 이어지고 막다른 길 없이 그럴듯한 결론에 도착한다', () => {
    const p = puzzleById.get(P)!, w = quizWalk(p, ['c1_disease', 'ca1_chair', 'ca2_fall']);
    expect(w.valid && w.at === null).toBe(true);
    expect(quizConclusion(p, ['c1_disease', 'ca1_chair', 'ca2_fall'])).toContain('지병');
    expect(sub({ path: ['c1_disease', 'ca1_chair', 'ca2_fall'] }).status).toBe('settled');
  });
  it('빈 칸이 있으면 확정되지 않고 기회도 줄지 않는다', () => {
    const s = createGameState();
    expect(submitPuzzle(s, P, { path: ['c1_head', 'c2_fight'] }).status).toBe('incomplete'); // 마지막 판단까지 가지 않았다
    expect(s.wrongCountByPuzzle[P]).toBeUndefined();
  });
  it('문답 구조: 질문 4개짜리 정답 길, 선택지는 판단 + 이유, 독살·약물은 없고 누구인가는 묻지 않는다', () => {
    const p = puzzleById.get(P)!, q = p.quiz!;
    expect(p.layout).toBe('quiz'); expect(p.correctSlots.path).toEqual(['c1_head', 'c2_fight', 'c3_altar', 'c4_moved']);
    expect(quizWalk(p, p.correctSlots.path).at).toBeNull();
    const all = Object.values(q.nodes).flatMap((n) => [n.q, ...n.choices.flatMap((c) => [c.judge, c.reason, c.says])]).join(' ');
    expect(all).not.toMatch(/독|약물|찻잔|화학/); expect(Object.values(q.nodes).some((n) => /누구/.test(n.q))).toBe(false);
    expect(q.nodes.q2.choices.length).toBeGreaterThanOrEqual(4);
  });
});

describe('씬 1·2 대사 출처 표시', () => {
  it('모든 대사에 source 가 있고 기획서 문장(spec)이 새 문장(new)보다 많다 (플레이어의 생각·행동 독백은 피드백으로 늘어 센 곳에서 뺀다)', () => {
    const nodes = Object.values(D).flatMap((d) => Object.values(d.nodes));
    expect(nodes.every((n) => ['spec', 'new', 'craft_on'].includes(n.source!))).toBe(true);
    const spoken = nodes.filter((n) => !n.voice); // 실제로 입으로 하는 대사
    expect(spoken.filter((n) => n.source === 'spec').length).toBeGreaterThan(spoken.filter((n) => n.source === 'new').length);
  });
});
