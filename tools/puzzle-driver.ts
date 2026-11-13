// 퍼즐 화면을 마우스 클릭으로 푸는 시험 도구 (e2e·스크린샷 공용): 조각·인물 카드 → 칸, 표시 칩, 바탕화면 조작, [결론 확정] → 확인 창
import { readFileSync } from 'node:fs';
import type { Page } from 'playwright';

interface Task { slot: string; kind: 'place' | 'mark'; single?: boolean; options: { id: string; label: string }[] }
interface P { id: string; layout: string; tasks?: Task[]; tokens?: { id: string; decoy?: boolean }[]; correctSlots: Record<string, string[]> }
const puzzles = JSON.parse(readFileSync('src/data/puzzles.json', 'utf8')) as P[];
export const puzzleData = (id: string) => puzzles.find((p) => p.id === id)!;

/** 규칙 안내(처음 한 번)가 떠 있으면 닫는다 */
export async function dismissRule(page: Page) { const b = page.locator('#puzzle [data-rule]'); if (await b.count()) { await b.first().click(); await page.waitForTimeout(80); } }

/** 바탕화면(P03): 휴지통의 이전 판과 최종본을 비교 실행해 바뀐 줄을 띄운다 */
export async function runDesktopCompare(page: Page) {
  const click = (sel: string, opts = {}) => page.locator(`#puzzle ${sel}`).first().click(opts);
  await page.locator('#puzzle [data-icon="trash"]').first().dblclick();
  await click('[data-wfile="auto"]');
  await page.locator('#puzzle [data-icon="compare"]').first().dblclick();
  for (let i = 0; i < 3; i++) await click('[data-cmp="a"]'); // 이전 판 = 자동저장(휴지통)
  await click('[data-cmp="b"]'); // 이후 판 = 최종본
  await click('[data-cmp="run"]');
}

/** 조각·표시를 정답대로 놓는다 (확정은 누르지 않는다). overrides 로 칸별 다른 답을 줄 수 있다. */
export async function placeCorrect(page: Page, id: string, overrides: Record<string, string[]> = {}) {
  const p = puzzleData(id), ans = { ...p.correctSlots, ...overrides };
  const click = (sel: string) => page.locator(`#puzzle ${sel}`).first().click();
  await dismissRule(page);
  const markSlots = new Set((p.tasks ?? []).filter((t) => t.kind === 'mark').map((t) => t.slot));
  if (p.layout === 'desktop') await runDesktopCompare(page);
  for (const [slot, ids] of Object.entries(ans)) {
    if (markSlots.has(slot)) continue;
    if (p.layout === 'plan' || p.layout === 'timeline') for (const t of ids) { await click(`[data-piece="${t}"]`); await click(`.zone[data-zone="${slot}"]`); }
    else if (p.layout === 'tree') { await click(`[data-person="${ids[0]}"]`); await click(`.zone[data-zone="${slot}"]`); }
    else if (p.layout === 'logic') { await click('[data-token="identity"]'); await click(`[data-zone="${ids[0]}"]`); }
  }
  for (const t of (p.tasks ?? []).filter((q) => q.kind === 'mark')) {
    if (p.layout === 'desktop') {
      const want = t.options.find((o) => o.id === ans[t.slot][0])!.label;
      for (let i = 0; i < 8 && (await page.locator(`#puzzle [data-cycle="${t.slot}"]`).innerText()) !== want; i++) await click(`[data-cycle="${t.slot}"]`);
    } else for (const o of t.options) { // 이미 표시한 선택(보류 저장분)은 건드리지 않고 다른 것만 누른다
      const sel = `#puzzle [data-chip="${t.slot}|${o.id}"]`;
      if (!(await page.locator(sel).count())) continue; // 제거된 후보
      const on = (await page.locator(sel).first().getAttribute('class'))?.includes(' on') ?? false;
      if (on !== ans[t.slot].includes(o.id)) await page.locator(sel).first().click();
    }
  }
}
/** [결론 확정] → 확인 창의 [확정] */
export async function confirm(page: Page) {
  await page.locator('#puzzle [data-submit]').click(); await page.waitForSelector('#puzzle [data-confirm="yes"]');
  await page.locator('#puzzle [data-confirm="yes"]').click(); await page.waitForTimeout(80);
}
