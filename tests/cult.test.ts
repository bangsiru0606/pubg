import { describe, expect, it } from 'vitest';
import docs from '../src/data/documents.json';
import evidence from '../src/data/evidence.json';
import real from '../src/data/dialogue.json';
import puzzles from '../src/data/puzzles.json';
import endings from '../src/data/endings.json';
import claims from '../src/data/claims.json';
import { areas } from '../src/explore/interaction';
import type { Dialogues } from '../src/core';

const D = real.dialogues as unknown as Dialogues;
const text = (ids: string[]) => ids.flatMap((id) => Object.values(D[id].nodes).map((n) => n.text)).join('\n');
const docIds = Object.entries(areas).flatMap(([a, ar]) => ar.interactables.filter((i) => i.type === 'examine' && i.docId).map((i) => ({ a, docId: (i as { docId: string }).docId })));

describe('빛의 교단 설정 (기획서 2.1.1): 드러나는 순서', () => {
  it('맥락 조사 지점은 모두 문서가 있고 단서 ID 를 만들지 않는다', () => {
    expect(docIds.map((d) => d.docId).sort()).toEqual(['doctrine_lobby', 'doctrine_ward', 'donor_plaque', 'prayer_schedule_choi', 'prayer_schedule_han', 'sermon_draft']);
    for (const { docId } of docIds) expect((docs as Record<string, { body: string[] }>)[docId].body.length, docId).toBeGreaterThan(2);
    expect(evidence).toHaveLength(16); // 새 단서 ID 없음
  });
  it('1~3층 자료·대사에는 교주·이혜정의 부녀 관계가 나오지 않는다 (지하에서만)', () => {
    const upper = [...docIds.filter((d) => d.a !== 'b1').map((d) => JSON.stringify((docs as Record<string, unknown>)[d.docId]))].join('\n') + text(['choi_okja', 'han_yujin', 'chae_soyeon', 'oh_miran', 'baek_office', 'lee_hyejeong', 'mono_broadcast']);
    expect(upper).not.toMatch(/교주|아버지|딸/);
    expect(JSON.stringify(puzzles)).not.toContain('교주');
    expect(text(['jeong_haneul_final'])).toContain('교주의 딸'); // 지하 고백
  });
  it('후원회: 3층 감사패는 이름 없이 "빛의 후원회"만, 지하 장부·운송표에 후원자 배정과 수령', () => {
    const plaque = JSON.stringify(docs.donor_plaque);
    expect(plaque).toContain('빛의 후원회'); expect(plaque).not.toMatch(/D-07|장기|봉헌/);
    const e = (id: string) => (evidence as { id: string; body: string[] }[]).find((x) => x.id === id)!.body.join('\n');
    expect(e('E12_ledger')).toMatch(/후원자 배정: .*D-07/); expect(e('E12_ledger')).toContain('후원금');
    expect(e('E15_transport_manifest')).toContain('후원자 측 수령');
    expect(docs.sermon_draft.body[docs.sermon_draft.body.length - 1]).toBe('교주 이한신');
  });
  it('오미란이 마지못해 "봉헌"을 말하고, 정하늘이 봉헌 교리로 설득했다고 말한다', () => {
    expect(text(['oh_miran'])).toContain('봉헌'); expect(text(['jeong_haneul_final'])).toMatch(/봉헌이 구원/);
    expect(text(['mono_broadcast'])).toContain('봉헌의 밤'); expect(text(['choi_okja'])).toContain('빌린 그릇');
  });
  it('질문 C·D 후보 문장과 엔딩 조직 줄에 후원회·봉헌이 반영되고 정답 구조는 그대로다', () => {
    const all = JSON.stringify(claims) + JSON.stringify(endings.lines.organization);
    expect(all).toContain('후원회'); expect(all).toContain('봉헌');
    for (const c of claims as { hypotheses: { isCorrect: boolean }[] }[]) expect(c.hypotheses.filter((h) => h.isCorrect)).toHaveLength(1);
  });
});
