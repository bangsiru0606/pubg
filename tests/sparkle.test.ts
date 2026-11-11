import { describe, expect, it } from 'vitest';
import { acquireEvidence, createGameState, setFlag } from '../src/core';
import { areas, isExamined, showsSparkle, type Examine } from '../src/explore/interaction';

const ex = (area: string, id: string) => areas[area].interactables.find((i) => i.id === id) as Examine;

describe('조사 지점 반짝임', () => {
  it('조사 전에만 보이고, 단서를 얻으면 사라진다', () => {
    const s = createGameState(); const note = ex('floor1', 'exam_note');
    expect(showsSparkle(note, s)).toBe(false); // baek_left 전에는 아직 조사할 수 없다
    setFlag(s, 'baek_left');
    expect(showsSparkle(note, s)).toBe(true);
    acquireEvidence(s, 'E03_preliminary_exam');
    expect(isExamined(note, s)).toBe(true); expect(showsSparkle(note, s)).toBe(false);
  });
  it('퍼즐이 딸린 지점은 단서를 얻어도 퍼즐을 열기 전까지 보인다', () => {
    const s = createGameState(); const rev = ex('room_baek', 'revision');
    setFlag(s, 'baek_refused'); acquireEvidence(s, 'E07_report_revision');
    expect(showsSparkle(rev, s)).toBe(true);
    setFlag(s, 'puzzle_opened:P03_revision_diff');
    expect(showsSparkle(rev, s)).toBe(false);
  });
  it('sparkle: false 로 끄고, 근접 조사(closeup)·NPC·문에는 쓰지 않는다', () => {
    const s = createGameState(); const altar = { ...ex('room_director', 'altar') };
    expect(showsSparkle(altar, s)).toBe(true);
    expect(showsSparkle({ ...altar, sparkle: false }, s)).toBe(false);
    expect(showsSparkle(ex('office', 'desk'), s)).toBe(false);
    for (const a of Object.values(areas)) for (const i of a.interactables) if (i.type !== 'examine') expect(showsSparkle(i, s)).toBe(false);
  });
  it('조사 지점마다 반짝임이 켜져 있다 (기본값)', () => {
    for (const a of Object.values(areas)) for (const i of a.interactables) if (i.type === 'examine') expect(i.sparkle).not.toBe(false);
  });
});
