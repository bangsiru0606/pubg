import { describe, expect, it } from 'vitest';
import real from '../src/data/dialogue.json';
import { acquireEvidence, createGameState, enterNode, getNode, hasFlag, puzzleById, submitPuzzle, shownEvidence, type Dialogues } from '../src/core';
import { areas, isAvailable, nearest } from '../src/explore/interaction';

const D = real.dialogues as unknown as Dialogues;
const find = (area: string, id: string) => areas[area].interactables.find((i) => i.id === id)!;
const P = 'P01_scene_rebuild';
const ok = { impactPosition: ['altar_floor'], finalPosition: ['desk_chair'], movedObjects: ['body', 'chair'] };

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
  it('책상 옆 충돌 → 혈흔 위치 충돌만 표시, 정답은 알려주지 않는다', () => {
    const r = sub({ ...ok, impactPosition: ['desk_side'] });
    expect(r.status).toBe('wrong');
    expect(r.conflicts).toEqual([puzzleById.get(P)!.conflicts['impactPosition:desk_side']]);
    expect(JSON.stringify(r.conflicts)).not.toContain('기도대 옆 바닥');
  });
  it('주사기를 이동 대상에 넣으면 충돌, 의자를 빼면 끌린 자국 자료가 충돌', () => {
    expect(sub({ ...ok, movedObjects: ['body', 'chair', 'syringe'] }).conflicts).toHaveLength(1);
    expect(sub({ ...ok, movedObjects: ['body'] }).conflicts).toEqual([puzzleById.get(P)!.conflicts['movedObjects:!chair']]);
  });
  it('빈 슬롯은 오답 횟수를 올리지 않는다', () => {
    const s = createGameState();
    expect(submitPuzzle(s, P, { ...ok, finalPosition: [] }).status).toBe('incomplete');
    expect(s.wrongCountByPuzzle[P]).toBeUndefined();
  });
  it('모든 과제 선택지가 정답과 충돌 항목을 포함한다', () => {
    const p = puzzleById.get(P)!;
    expect(p.tasks!.map((t) => t.slot)).toEqual(p.slots);
  });
});

describe('씬 1·2 대사 출처 표시', () => {
  it('모든 대사에 source 가 있고 기획서 문장(spec)이 새 문장(new)보다 많다', () => {
    const nodes = Object.values(D).flatMap((d) => Object.values(d.nodes));
    expect(nodes.every((n) => n.source === 'spec' || n.source === 'new')).toBe(true);
    expect(nodes.filter((n) => n.source === 'spec').length).toBeGreaterThan(nodes.filter((n) => n.source === 'new').length);
  });
});
