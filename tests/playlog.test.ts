import { describe, expect, it } from 'vitest';
import { createGameState, setFlag, puzzles } from '../src/core';
import { submitPuzzle } from './helpers';
import { buildProgress } from '../src/explore/playthrough';
import { countOpen, emptyLog, fmt, observe, sceneOf, table, toText, type Observation } from '../src/explore/playlog';

const base = (o: Partial<Observation> & Pick<Observation, 'now' | 'state'>): Observation => ({ started: true, ended: false, openPuzzleId: null, inMenu: false, hidden: false, dt: 250, ...o });

describe('플레이 기록 (개발 전용 계산)', () => {
  it('씬 번호는 buildProgress 가 만드는 씬 시작 상태와 같다 (1~7)', () => {
    expect(sceneOf(createGameState())).toBe(1);
    for (let n = 2; n <= 7; n++) expect(sceneOf(buildProgress(n).state), `씬 ${n}`).toBe(n);
    expect(sceneOf(buildProgress(7, { secure: false }).state)).toBe(7);
  });
  it('씬이 바뀔 때 앞 씬이 끝나고 다음 씬이 시작된다', () => {
    const log = emptyLog(), s = createGameState();
    observe(log, base({ now: 1000, state: s }));
    setFlag(s, 'cutscene_done:hospital_intro');
    observe(log, base({ now: 61000, state: s }));
    expect(log.scenes[1]).toMatchObject({ start: 1000, end: 61000 });
    expect(log.scenes[2].start).toBe(61000);
    const t = table(log, 121000);
    expect(t.rows[0].cells.slice(0, 3)).toEqual(['0:00', '1:00', '1:00']); expect(t.rows[1].cells[1]).toBe('진행 중'); expect(t.total).toBe('2:00');
  });
  it('수첩·메뉴와 탭을 떠난 시간은 따로 쌓이고 소요에는 포함된다', () => {
    const log = emptyLog(), s = createGameState();
    observe(log, base({ now: 0, state: s }));
    observe(log, base({ now: 250, state: s, inMenu: true })); observe(log, base({ now: 500, state: s, hidden: true, inMenu: true }));
    expect(log.scenes[1].menuMs).toBe(250); expect(log.scenes[1].pausedMs).toBe(250);
  });
  it('퍼즐: 열어 둔 시간, 오답·힌트(2·4·6회), 해결 시각', () => {
    const log = emptyLog(), s = createGameState(), p = puzzles[0];
    observe(log, base({ now: 0, state: s }));
    observe(log, base({ now: 1000, state: s, openPuzzleId: p.id })); countOpen(log, null, p.id);
    s.wrongCountByPuzzle[p.id] = 4;
    observe(log, base({ now: 2000, state: s, openPuzzleId: p.id }));
    submitPuzzle(s, p.id, p.correctSlots);
    observe(log, base({ now: 3000, state: s }));
    expect(log.puzzles[p.id]).toMatchObject({ first: 1000, end: 3000, openMs: 500, opens: 1, wrong: 4, hints: 2, solved: true });
  });
  it('새 게임(씬 번호가 거꾸로 감)이면 기록을 새로 시작하고, 시작 전(started=false)에는 아무것도 쌓지 않는다', () => {
    const log = emptyLog();
    observe(log, base({ now: 0, state: buildProgress(4).state })); expect(log.lastScene).toBe(4);
    observe(log, base({ now: 500, state: createGameState() })); expect(log.lastScene).toBe(1); expect(log.startedAt).toBe(500); expect(log.scenes[4]).toBeUndefined();
    const idle = emptyLog(); observe(idle, base({ now: 0, state: createGameState(), started: false })); expect(idle.startedAt).toBeNull();
  });
  it('엔딩이 열리면 끝나고, 다시 추리하기로 보고서를 다시 쓰면 다시 진행 중이 된다', () => {
    const log = emptyLog(), s = buildProgress(7).state;
    observe(log, base({ now: 0, state: s })); observe(log, base({ now: 5000, state: s, ended: true }));
    expect(log.endedAt).toBe(5000); expect(table(log, 9000).total).toBe('0:05');
    observe(log, base({ now: 6000, state: s })); expect(log.endedAt).toBeUndefined();
  });
  it('다시 추리하기로 다시 낸 보고서도 회차별로 기록에 남는다', () => {
    const log = emptyLog(), s = buildProgress(7).state;
    observe(log, base({ now: 0, state: s })); observe(log, base({ now: 5000, state: s, ended: true })); observe(log, base({ now: 5250, state: s, ended: true })); // 엔딩 화면이 열려 있는 동안은 한 번만 센다
    expect(log.reports).toHaveLength(1);
    observe(log, base({ now: 6000, state: s })); // 다시 추리하기
    observe(log, base({ now: 9000, state: s, ended: true }));
    expect(log.reports).toHaveLength(2); expect(log.reports![1].at).toBe(9000);
    const t = toText(log, 10000); expect(t).toContain('보고서 제출 2회'); expect(t).toContain('2회차');
  });
  it('텍스트 복사본에 총 시간·씬·퍼즐 표가 들어 있다', () => {
    const log = emptyLog(); observe(log, base({ now: 0, state: createGameState() }));
    const t = toText(log, 90000);
    expect(t).toContain('총 시간 1:30'); expect(t).toContain('씬 1 의뢰'); expect(t).toContain('P01'); expect(t.split('\n').filter((l) => l.includes('\t')).length).toBeGreaterThanOrEqual(13);
    expect(fmt(75000)).toBe('1:15');
  });
});
