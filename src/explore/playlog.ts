// 플레이 기록 (개발 서버 전용 도구의 순수 계산 부분: DOM·저장소 없음, 테스트 대상).
// 씬 1~7 과 퍼즐 P01~P05 의 시작·끝 시각, 수첩·메뉴에 머문 시간, 탭을 떠나 있던 시간(일시정지), 퍼즐 오답·힌트 횟수를 쌓는다.
import { gradeOf, hasFlag, puzzles, resolveEnding, type GameState } from '../core';

export interface SceneRec { start: number; end?: number; menuMs: number; pausedMs: number }
export interface PuzzleRec { first: number; end?: number; openMs: number; opens: number; wrong: number; hints: number; solved: boolean }
/** 보고서를 낸 한 번의 기록 (엔딩 뒤 ‘다시 추리하기’로 다시 낸 것도 모두 남는다) */
export interface ReportRec { at: number; ending: string; letter: string; solved: number }
export interface PlayLog { startedAt: number | null; endedAt?: number; scenes: Record<number, SceneRec>; puzzles: Record<string, PuzzleRec>; lastScene: number; reports?: ReportRec[] }
export const emptyLog = (): PlayLog => ({ startedAt: null, scenes: {}, puzzles: {}, lastScene: 0, reports: [] });
export const SCENE_COUNT = 7;

/** 상태로 지금 몇 번째 씬인지 (1~7). 씬 경계는 각 씬이 끝나는 조건으로 정한다 (explore/playthrough.ts 의 SCENE_STEPS 와 같다). */
export function sceneOf(s: GameState): number {
  if (hasFlag(s, 'flag_evidence_secured') || hasFlag(s, 'flag_confronted_immediately')) return 7; // 증거 보존 선택 뒤 = 최종 보고서
  if (hasFlag(s, 'haneul_confessed')) return 6;
  if (hasFlag(s, 'basement_key')) return 5; // 오미란이 지하 열쇠를 건넸다 (퍼즐은 층 이동을 막지 않아 이야기 사건으로 나눈다)
  if (hasFlag(s, 'haneul_met') && hasFlag(s, 'floor3_reason')) return 4; // 3층으로 올라갈 이유가 생겼다
  if (s.evidenceIds.includes('E04_wristband_fragment')) return 3; // 손목띠 → 2층
  if (hasFlag(s, 'cutscene_done:hospital_intro')) return 2;
  return 1;
}

export interface Observation { now: number; started: boolean; state: GameState; ended: boolean; openPuzzleId: string | null; inMenu: boolean; hidden: boolean; dt: number }

/** 한 번 관찰한 내용(250ms 간격 등)을 기록에 반영한다. 기록을 제자리에서 바꾼다. */
export function observe(log: PlayLog, o: Observation): PlayLog {
  if (!o.started) return log;
  const sc = sceneOf(o.state);
  if (log.startedAt === null || sc < log.lastScene) { // 새 게임이 시작됐다 (씬 번호가 거꾸로 갔다)
    const fresh = emptyLog(); Object.assign(log, fresh); log.startedAt = o.now;
  }
  log.lastScene = Math.max(log.lastScene, sc);
  for (let n = 1; n <= sc; n++) {
    const r = (log.scenes[n] ??= { start: n === 1 ? log.startedAt! : o.now, menuMs: 0, pausedMs: 0 });
    if (n < sc && r.end === undefined) r.end = o.now; // 이 씬은 끝났다
  }
  const last = log.scenes[SCENE_COUNT];
  if (o.ended) {
    if (log.endedAt === undefined) { const g = gradeOf(o.state); (log.reports ??= []).push({ at: o.now, ending: resolveEnding(o.state).id, letter: g.letter, solved: g.claims.filter((c) => c.solved).length }); } // 엔딩 화면이 새로 열렸다 = 보고서를 한 번 냈다
    log.endedAt = o.now; if (last) last.end = o.now; // 엔딩 화면이 열린 시각이 끝
  } else if (log.endedAt !== undefined && sc === SCENE_COUNT) { delete log.endedAt; if (last) delete last.end; } // 다시 추리하기: 보고서를 다시 쓰는 중
  const cur = log.scenes[sc];
  if (cur) { if (o.hidden) cur.pausedMs += o.dt; else if (o.inMenu) cur.menuMs += o.dt; }
  for (const p of puzzles) {
    const wrong = o.state.wrongCountByPuzzle[p.id] ?? 0, solved = o.state.solvedPuzzleIds.includes(p.id);
    const open = o.openPuzzleId === p.id;
    let r = log.puzzles[p.id];
    if (!r && !open && !wrong && !solved) continue;
    r ??= (log.puzzles[p.id] = { first: o.now, openMs: 0, opens: 0, wrong: 0, hints: 0, solved: false });
    if (open) { r.openMs += o.dt; r.end = o.now; }
    r.wrong = Math.max(r.wrong, wrong);
    if (solved && !r.solved) { r.solved = true; r.end = o.now; }
  }
  return log;
}
/** 퍼즐 화면이 새로 열릴 때 열린 횟수를 센다 (이전 관찰에서는 닫혀 있었고 이번에 열려 있음) */
export function countOpen(log: PlayLog, prevOpen: string | null, open: string | null) { if (open && open !== prevOpen && log.puzzles[open]) log.puzzles[open].opens++; }

export const fmt = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const SCENE_NAMES = ['의뢰', '1층·원장실', '2층 병동', '3층 직원실', '지하 1층', '증거 보존 선택', '최종 보고서'];

export interface Row { label: string; cells: string[] }
/** 화면·복사용 표. 시각은 첫 시작부터의 경과 시간(분:초). */
export function table(log: PlayLog, now: number): { head: string[]; rows: Row[]; puzzleHead: string[]; puzzleRows: Row[]; total: string } {
  const t0 = log.startedAt ?? now, since = (ms: number) => fmt(ms - t0);
  const rows = Array.from({ length: SCENE_COUNT }, (_, i) => i + 1).map((n) => {
    const r = log.scenes[n];
    if (!r) return { label: `씬 ${n} ${SCENE_NAMES[n - 1]}`, cells: ['-', '-', '-', '-', '-'] };
    const dur = (r.end ?? log.endedAt ?? now) - r.start;
    return { label: `씬 ${n} ${SCENE_NAMES[n - 1]}`, cells: [since(r.start), r.end ? since(r.end) : '진행 중', fmt(dur), fmt(r.menuMs), fmt(r.pausedMs)] };
  });
  const puzzleRows = puzzles.map((p) => {
    const r = log.puzzles[p.id];
    if (!r) return { label: p.id.slice(0, 3), cells: ['-', '-', '-', '-', '-', '-'] };
    return { label: p.id.slice(0, 3), cells: [since(r.first), r.end !== undefined ? since(r.end) : '-', fmt((r.end ?? now) - r.first), fmt(r.openMs), `${r.wrong}`, `${r.hints}`] };
  });
  return { head: ['시작', '끝', '소요', '수첩·메뉴', '일시정지'], rows, puzzleHead: ['시작', '끝', '소요(첫 열기~)', '열어 둔 시간', '오답', '힌트'], puzzleRows, total: fmt((log.endedAt ?? now) - t0) };
}

/** 클립보드용 텍스트 (탭 구분) */
export function toText(log: PlayLog, now: number): string {
  const t = table(log, now);
  const wrong = Object.values(log.puzzles).reduce((a, r) => a + r.wrong, 0), hints = Object.values(log.puzzles).reduce((a, r) => a + r.hints, 0);
  return [`총 시간 ${t.total}${log.endedAt === undefined ? ' (진행 중)' : ''} · 퍼즐 오답 ${wrong}회 · 힌트 ${hints}단계 합계`, '', ['씬', ...t.head].join('\t'), ...t.rows.map((r) => [r.label, ...r.cells].join('\t')),
    '', ['퍼즐', ...t.puzzleHead].join('\t'), ...t.puzzleRows.map((r) => [r.label, ...r.cells].join('\t')), ...(log.reports?.length ? ['', `보고서 제출 ${log.reports.length}회`, ...log.reports.map((r, i) => `  ${i + 1}회차 ${fmt(r.at - (log.startedAt ?? r.at))} — ${r.ending.replace('ending_', '엔딩 ').toUpperCase()} · 해결 ${r.solved}/4 · 추리 등급 ${r.letter}`)] : []), '', '시각은 첫 시작부터의 경과(분:초). 소요에는 수첩·메뉴·일시정지 시간이 포함된다.'].join('\n');
}
