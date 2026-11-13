import { describe, expect, it } from 'vitest';
import { puzzles } from '../src/core';
import { ROWS, checkRows, pieceRows } from '../tools/puzzle-evidence-table';

describe('퍼즐 근거표 (docs/퍼즐_근거표.md)', () => {
  it('표의 모든 인용문이 실제 단서·진술·문서 패널에 있다', () => { for (const r of checkRows()) expect(r.ok, `${r.row.puzzle}/${r.row.slot}: ${r.row.token}`).toBe(true); });
  it('근거는 모두 퍼즐이 열리기 전에 얻는다 (지워 나가기로만 맞히는 칸이 없다)', () => { for (const r of checkRows()) expect(r.before.every(Boolean), `${r.row.puzzle}/${r.row.slot}`).toBe(true); });
  it('퍼즐의 모든 정답 칸·조각이 표에 있다 (조각 → 출처 → 원문)', () => {
    const rows = [...ROWS, ...pieceRows()];
    for (const p of puzzles) {
      for (const slot of p.slots) expect(rows.some((r) => r.puzzle === p.id && r.slot === slot), `${p.id}/${slot} 줄 없음`).toBe(true);
      for (const c of Object.values(p.quiz?.nodes ?? {}).flatMap((n) => n.choices)) expect(rows.some((r) => r.puzzle === p.id && r.token === `${c.judge} — ${c.reason}`), `${p.id}/${c.id} 선택지 줄 없음`).toBe(true);
      for (const t of p.tokens ?? []) expect(rows.some((r) => r.puzzle === p.id && r.token === t.label), `${p.id}/${t.id} 조각 줄 없음`).toBe(true);
    }
  });
});
