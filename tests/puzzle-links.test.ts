import { describe, expect, it } from 'vitest';
import { acquireEvidence, correctLinksOf, createGameState, hintFor, linkAccepted, linkCandidates, puzzles, submitPuzzle, type GameState, type Puzzle } from '../src/core';
import { PUZZLE_SCENE, simulate, stateBeforePuzzle } from '../tools/puzzle-sim';
import { SCENE_STEPS } from '../src/explore/playthrough';

const P = (id: string) => puzzles.find((p) => p.id === id)!;
const fresh = (id: string) => stateBeforePuzzle(id);

describe('근거 카드 연결 판정 (core/puzzle.ts)', () => {
  it('모든 퍼즐에 근거 규칙이 있고, 슬롯·허용 근거가 유효하다 (P05 linkedSources 는 슬롯 자체가 근거 선택이라 제외)', () => {
    for (const p of puzzles) {
      expect(Object.keys(p.evidenceLinks ?? {}).length, p.id).toBeGreaterThan(0);
      for (const [slot, ids] of Object.entries(p.evidenceLinks!)) { expect(p.slots, `${p.id}/${slot}`).toContain(slot); expect(ids.length).toBeGreaterThan(0); }
    }
    expect(P('P05_patient_code').evidenceLinks).not.toHaveProperty('linkedSources');
  });
  it('정답 토큰 + 정답 근거 = 정답', () => {
    for (const p of puzzles) { const s = fresh(p.id); expect(submitPuzzle(s, p.id, p.correctSlots, correctLinksOf(p)).status, p.id).toBe('solved'); }
  });
  it('정답 토큰 + 틀린 근거 = 오답 (칸마다), 충돌 문장은 1개', () => {
    for (const p of puzzles) for (const slot of Object.keys(p.evidenceLinks!)) {
      const s = fresh(p.id), links = correctLinksOf(p);
      const wrong = linkCandidates(s).map((c) => c.id).find((id) => !p.evidenceLinks![slot].includes(id))!;
      const r = submitPuzzle(s, p.id, p.correctSlots, { ...links, [slot]: wrong });
      expect(r.status, `${p.id}/${slot}`).toBe('wrong');
      expect(r.conflicts, `${p.id}/${slot}`).toHaveLength(1);
      expect(r.conflicts[0]).toContain('내용을 말해 주지 않는다'); // 어느 자료인지 이름으로
    }
  });
  it('근거를 붙이지 않은 칸이 있으면 incomplete: 오답 횟수·힌트 단계가 오르지 않고, 빈 칸 슬롯을 알려 준다', () => {
    const p = P('P02_night_timeline'), s = fresh(p.id), links = correctLinksOf(p); delete links.t2246; delete links.t2234;
    for (let i = 0; i < 8; i++) {
      const r = submitPuzzle(s, p.id, p.correctSlots, links);
      expect(r.status).toBe('incomplete'); expect(r.conflicts).toEqual([]); expect(r.missingLinks).toEqual(['t2234', 't2246']);
    }
    expect(s.wrongCountByPuzzle[p.id] ?? 0).toBe(0); expect(s.hintCountByPuzzle[p.id] ?? 0).toBe(0);
    expect(submitPuzzle(s, p.id, p.correctSlots, {}).missingLinks).toHaveLength(4);
    // 근거가 붙어 있지만 틀리면 지금처럼 오답
    expect(submitPuzzle(s, p.id, p.correctSlots, { ...correctLinksOf(p), t2246: 'E01_last_letter' }).status).toBe('wrong');
  });
  it('근거 없이 판정하는 경로가 없다: submitPuzzle 은 links 를 반드시 받고, 호출하는 곳은 모두 근거를 넘긴다', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const core = readFileSync('src/core/puzzle.ts', 'utf8');
    expect(core).toContain('export function submitPuzzle(s: GameState, puzzleId: string, a: PuzzleAnswer, links: PuzzleLinks): PuzzleResult');
    expect(core).not.toContain('links === undefined'); expect(core).not.toContain('links?: PuzzleLinks'); expect(core).not.toContain('links ?? {}');
    const files = ['src', 'tools', 'tests'].flatMap((d) => (readdirSync(d, { recursive: true }) as string[]).filter((f) => f.endsWith('.ts')).map((f) => `${d}/${f}`));
    for (const f of files) {
      if (f === 'src/core/puzzle.ts' || f === 'tests/helpers.ts' || f === 'tests/puzzle-links.test.ts') continue;
      const src = readFileSync(f, 'utf8');
      let at = src.indexOf('submitPuzzle(');
      while (at >= 0) { // 호출 한 줄에 근거(links·correctLinksOf)가 있거나, tests 는 helpers.submitPuzzle 을 쓴다
        const line = src.slice(at, src.indexOf('\n', at)), isDef = line.startsWith('submitPuzzle(s: GameState');
        if (!isDef && !f.startsWith('tests/')) expect(/links|Links/.test(line), `${f}: ${line}`).toBe(true);
        at = src.indexOf('submitPuzzle(', at + 1);
      }
      if (f.startsWith('tests/')) for (const l of src.split('\n')) if (l.startsWith('import') && l.includes('submitPuzzle') && l.includes("'../src/core'")) throw new Error(`${f}: 코어 submitPuzzle 을 직접 불러오지 않는다 (tests/helpers 를 쓴다)`);
    }
  });
  it('맥락 단서(E01)는 고를 수는 있지만 근거로 인정되지 않는다', () => {
    const p = P('P01_scene_rebuild'), s = fresh(p.id);
    expect(linkCandidates(s).some((c) => c.id === 'E01_last_letter')).toBe(true); // 후보에는 보인다
    expect(linkAccepted(s, p, 'impactPosition', 'E01_last_letter')).toBe(false);
    const tweaked: Puzzle = { ...p, evidenceLinks: { ...p.evidenceLinks, impactPosition: ['E01_last_letter'] } }; // 허용 목록에 있어도 context 단서면 인정하지 않는다
    expect(linkAccepted(s, tweaked, 'impactPosition', 'E01_last_letter')).toBe(false);
  });
  it('가지지 않은 단서는 붙일 수 없다 (허용 목록에 있어도)', () => {
    const p = P('P03_revision_diff'), s = createGameState(); acquireEvidence(s, 'E03_preliminary_exam');
    expect(linkAccepted(s, p, 'marked', 'E07_report_revision')).toBe(false);
    expect(linkAccepted(s, p, 'marked', 'E03_preliminary_exam')).toBe(true);
  });
  it('오답일 때 충돌 문장은 항상 1개 이하이고, 근거 문제가 토큰 충돌보다 먼저다', () => {
    let n = 0;
    for (const p of puzzles) {
      const s0 = fresh(p.id);
      for (let i = 0; i < 300; i++) {
        const s = structuredClone(s0) as GameState, ans: Record<string, string[]> = {};
        p.slots.forEach((sl, si) => {
          const t = p.tasks?.find((q) => q.slot === sl);
          ans[sl] = t ? (t.kind === 'place' ? [t.options[(i + sl.length) % t.options.length].id] : t.options.filter((_, k) => ((i >> k) & 1) || k === 0).map((o) => o.id)) : [p.tokens![(i + si) % p.tokens!.length].id];
        });
        const links: Record<string, string> = {}, c = linkCandidates(s);
        for (const sl of Object.keys(p.evidenceLinks!)) links[sl] = c[(i * 7 + sl.length) % c.length].id;
        const r = submitPuzzle(s, p.id, ans, links);
        if (r.status === 'wrong') { n++; expect(r.conflicts.length, `${p.id}#${i}`).toBeLessThanOrEqual(1); }
      }
    }
    expect(n).toBeGreaterThan(500);
    const p = P('P01_scene_rebuild'), s = fresh(p.id); // 토큰도 근거도 틀리면 근거 문장
    const r = submitPuzzle(s, p.id, { ...p.correctSlots, impactPosition: ['desk_side'] }, { ...correctLinksOf(p), finalPosition: 'E02_altar_blood' });
    expect(r.conflicts).toHaveLength(1); expect(r.conflicts[0]).toContain('내용을 말해 주지 않는다');
    const r2 = submitPuzzle(s, p.id, { ...p.correctSlots, impactPosition: ['desk_side'] }, correctLinksOf(p));
    expect(r2.conflicts).toEqual(['기도대 아래 혈흔과 맞지 않는다.']); // 토큰 충돌 하나, 자료 이름으로
  });
  it('힌트 3단계 자동 완성은 토큰과 근거를 함께 채운다', () => {
    const p = P('P01_scene_rebuild');
    const h = hintFor(p, 6, { impactPosition: ['desk_side'], finalPosition: ['desk_chair'], movedObjects: ['body', 'chair'] }, {});
    expect(h.autoFill).toMatchObject({ slotId: 'impactPosition', tokens: ['altar_floor'], link: 'E03_preliminary_exam' });
    const h2 = hintFor(p, 6, p.correctSlots, { impactPosition: 'E03_preliminary_exam' }); // 토큰은 맞고 근거만 비어 있어도 그 칸을 채운다
    expect(h2.autoFill?.slotId).toBe('finalPosition'); expect(h2.autoFill?.link).toBe('baek_s_natural');
    expect(hintFor(p, 6, p.correctSlots, correctLinksOf(p)).autoFill).toBeNull();
  });
  it('근거 후보는 가진 단서·진술 전부다 (정답 근거만 추리지 않는다)', () => {
    const s = fresh('P03_revision_diff'), c = linkCandidates(s).map((x) => x.id);
    for (const id of s.evidenceIds) expect(c).toContain(id);
    for (const id of Object.keys(s.statements)) expect(c).toContain(id);
    expect(c.length).toBeGreaterThan(P('P03_revision_diff').evidenceLinks!.marked.length * 4);
  });
});

describe('퍼즐이 열릴 때 가진 원문만으로 추론된다', () => {
  it('허용 근거는 그 퍼즐이 열리기 전에 얻는 단서·진술이다', () => {
    for (const p of puzzles) {
      const s = fresh(p.id);
      for (const [slot, ids] of Object.entries(p.evidenceLinks!)) for (const id of ids) expect(s.evidenceIds.includes(id) || !!s.statements[id], `${p.id}/${slot}: ${id}`).toBe(true);
    }
  });
  it('퍼즐 씬 번호 표는 SCENE_STEPS 와 같다', () => { for (const [id, n] of Object.entries(PUZZLE_SCENE)) expect(SCENE_STEPS[n - 1].puzzles, id).toContain(id); });
});

describe('무작위 제출로는 우연히 풀리지 않는다', () => {
  it('퍼즐마다 1만 회: 오답 5회 이내(6번 제출)에 풀릴 확률 1% 미만', () => {
    for (const p of puzzles) { const r = simulate(p.id, { trials: 10000 }); expect(r.rate, `${p.id} ${(r.rate * 100).toFixed(2)}%`).toBeLessThan(0.01); }
  });
  it('수정 전(토큰만)에는 P01~P04 가 1% 를 넘었다 (이 시험이 의미가 있다)', () => {
    for (const id of ['P01_scene_rebuild', 'P02_night_timeline', 'P03_revision_diff', 'P04_approval_chain']) expect(simulate(id, { trials: 5000, useLinks: false }).rate, id).toBeGreaterThan(0.01);
  });
});

describe('화면은 근거를 판정에 넘긴다', () => {
  it('퍼즐 화면(ui/puzzle.ts)이 붙인 근거를 submitPuzzle 에 넘기고, 재현 도구(playthrough·main)는 정답 근거를 넘긴다', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('src/ui/puzzle.ts', 'utf8')).toContain('submitPuzzle(s, puzzleId, toAnswer(), { ...links })');
    expect(readFileSync('src/explore/playthrough.ts', 'utf8')).toContain('correctLinksOf(p)');
    expect(readFileSync('src/main.ts', 'utf8')).toContain('applyScene(s, n)'); // F9·시험 훅 ff 는 playthrough 로 근거까지 푼다
  });
});

