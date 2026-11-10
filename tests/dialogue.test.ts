import { describe, expect, it } from 'vitest';
import fixture from '../src/data/dialogue.test-fixture.json';
import {
  MSG_NO_CONFLICT, MSG_REPEAT, acquireEvidence, availableChoices, createGameState, enterNode, getNode, hasFlag, presentEvidence,
  type Dialogue, type Dialogues,
} from '../src/core';

const D = fixture.dialogues as unknown as Dialogues;

describe('대화 엔진 (테스트 전용 대사)', () => {
  it('노드 진입 시 단서·플래그가 처리된다', () => {
    const s = createGameState();
    const { acquired } = enterNode(s, getNode(D, 'test_eunho_intro', 'n3'));
    expect(acquired).toEqual(['E01_last_letter']);
    expect(hasFlag(s, 'intro_done')).toBe(true);
  });
  it('선택지: 플래그 조건 필터', () => {
    const s = createGameState();
    const node = { speaker: 'han_jisu', text: 'y', choices: [{ text: 'a', next: 'n' }, { text: 'b', next: 'n', requiresFlag: 'f' }] };
    expect(availableChoices(s, node)).toHaveLength(1);
    s.flags.push('f');
    expect(availableChoices(s, node)).toHaveLength(2);
  });
  it('9.2/9.3: 미확인 → 관련 없는 단서는 중립 메시지만 → 모순 → 수정, 같은 모순 반복 불가', () => {
    const s = createGameState();
    acquireEvidence(s, 'E03_preliminary_exam'); acquireEvidence(s, 'E01_last_letter');
    const d = D.test_baek_lobby;
    enterNode(s, d.nodes.b1);
    expect(s.statements.baek_s1.stage).toBe('unconfirmed');
    expect(presentEvidence(s, d, 'test_baek_lobby', 'b1', ['E01_last_letter'])).toEqual({ kind: 'none', message: MSG_NO_CONFLICT });
    expect(s.statements.baek_s1.stage).toBe('unconfirmed');
    expect(presentEvidence(s, d, 'test_baek_lobby', 'b1', ['E03_preliminary_exam'])).toEqual({ kind: 'ok', next: 'b_contra' });
    expect(s.statements.baek_s1.stage).toBe('contradiction');
    expect(presentEvidence(s, d, 'test_baek_lobby', 'b1', ['E03_preliminary_exam'])).toEqual({ kind: 'repeat', message: MSG_REPEAT });
    enterNode(s, d.nodes.b_rev);
    expect(s.statements.baek_s1.stage).toBe('revised');
    expect(s.statements.baek_s1.revisedText).toContain('정정합니다');
  });
  it('핵심 수정 증언은 물증/기록 하나 이상 없이는 열리지 않는다', () => {
    const s = createGameState();
    acquireEvidence(s, 'E08_miran_revised'); // 증언
    const d: Dialogue = { start: 'a', nodes: {
      a: { speaker: 'han_jisu', text: 't', statement: { id: 's' }, present: [{ evidenceIds: ['E08_miran_revised'], next: 'r' }] },
      r: { speaker: 'han_jisu', text: 'new', revises: { id: 's' } },
    } };
    enterNode(s, d.nodes.a);
    expect(presentEvidence(s, d, 'd', 'a', ['E08_miran_revised']).kind).toBe('none');
  });
  it('벌점·진행 차단 없음: 잘못 제시해도 상태 변화 없음', () => {
    const s = createGameState(); acquireEvidence(s, 'E01_last_letter');
    const before = JSON.stringify(s);
    presentEvidence(s, D.test_baek_lobby, 'test_baek_lobby', 'b1', ['E01_last_letter']);
    expect(JSON.stringify(s)).toBe(before);
  });
});
