import { describe, expect, it } from 'vitest';
import { puzzles } from '../src/core';
import { ROWS, checkRows } from '../tools/puzzle-evidence-table';

describe('퍼즐 근거표 (docs/퍼즐_근거표.md)', () => {
  it('표의 모든 인용문이 실제 단서·진술·문서 패널에 있다', () => { for (const r of checkRows()) expect(r.ok, `${r.row.puzzle}/${r.row.slot}: ${r.row.token}`).toBe(true); });
  it('근거는 모두 퍼즐이 열리기 전에 얻는다 (지워 나가기로만 맞히는 칸이 없다)', () => { for (const r of checkRows()) expect(r.before.every(Boolean), `${r.row.puzzle}/${r.row.slot}`).toBe(true); });
  it('퍼즐의 모든 정답 칸이 표에 있고, 허용 근거는 표의 인용 근거와 겹친다', () => {
    for (const p of puzzles) {
      for (const slot of p.slots) expect(ROWS.some((r) => r.puzzle === p.id && r.slot === slot), `${p.id}/${slot} 줄 없음`).toBe(true);
      for (const [slot, allowed] of Object.entries(p.evidenceLinks ?? {})) {
        const cited = ROWS.filter((r) => r.puzzle === p.id && r.slot === slot).flatMap((r) => r.cites.map((c) => c.id));
        expect(allowed.some((id) => cited.includes(id)), `${p.id}/${slot}`).toBe(true);
      }
    }
  });
});
