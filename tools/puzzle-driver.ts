// 퍼즐 화면을 마우스 클릭으로 푸는 시험 도구 (e2e·스크린샷 공용): 토큰 → 칸, 표시 칩, 근거 칸 → 근거 카드, [확인]
import { readFileSync } from 'node:fs';
import type { Page } from 'playwright';

type Task = { slot: string; kind: 'place' | 'mark' };
interface P { id: string; layout: string; tasks: Task[]; tokens?: { id: string; label: string }[]; boxes?: { id: string }[]; correctSlots: Record<string, string[]>; evidenceLinks?: Record<string, string[]> }
const puzzles = JSON.parse(readFileSync('src/data/puzzles.json', 'utf8')) as P[];
const evidence = JSON.parse(readFileSync('src/data/evidence.json', 'utf8')) as { id: string; title: string }[];
export const puzzleData = (id: string) => puzzles.find((p) => p.id === id)!;

/** 토큰·표시를 정답대로 놓는다 (근거는 붙이지 않는다) */
export async function placeCorrect(page: Page, id: string, overrides: Record<string, string[]> = {}) {
  const p = puzzleData(id), ans = { ...p.correctSlots, ...overrides };
  const click = (sel: string) => page.locator(`#puzzle ${sel}`).first().click();
  if (p.layout === 'timeline') {
    for (const [box, toks] of Object.entries(ans)) { await click(`[data-token="${toks[0]}"]`); await click(`[data-zone="${box}"]`); }
  } else {
    for (const t of p.tasks) {
      if (t.kind === 'place') { await click(`[data-token="${t.slot}"]`); await click(`[data-zone="${ans[t.slot][0]}"]`); }
      else for (const o of ans[t.slot]) await click(`[data-chip="${t.slot}|${o}"]`);
    }
  }
}
/** 진술 카드는 같은 화자의 진술이 여럿이라 이름만으로 고를 수 없다: 문장 일부로 고른다 */
const STATEMENT_SNIPPET: Record<string, string> = { baek_s_natural: '집무실 의자에 앉으신 채', choi_s_thud: '쿵 하고 둔탁한', han_s_bracelet: '노란 실팔찌', chae_s_return: '밤에 나갔다가 돌아왔어요' };
/** 그 칸에 근거 카드를 붙인다. 단서는 제목으로, 진술(STATEMENT_SNIPPET 에 있는 ID)은 문장 일부로 고른다. */
export async function attachLink(page: Page, slot: string, cardId: string) {
  await page.locator(`#puzzle [data-link="${slot}"]`).first().click();
  const snippet = STATEMENT_SNIPPET[cardId];
  if (snippet) { await page.locator('#puzzle .lplist .lrow', { hasText: snippet }).first().click(); return; }
  const title = evidence.find((e) => e.id === cardId)?.title;
  if (!title) throw new Error(`근거 카드 이름을 모른다: ${cardId}`);
  await page.locator('#puzzle .lplist').getByText(title, { exact: true }).first().click(); // 목록 줄의 이름 칸(.lt)을 누른다
}
/** 정답 근거(허용 목록의 첫 번째)를 모든 근거 칸에 붙인다. links 로 칸별 다른 카드를 줄 수 있다. */
export async function attachCorrectLinks(page: Page, id: string, links: Record<string, string> = {}) {
  const p = puzzleData(id);
  for (const [slot, allowed] of Object.entries(p.evidenceLinks ?? {})) await attachLink(page, slot, links[slot] ?? allowed[0]);
}
export async function submit(page: Page) { await page.locator('#puzzle [data-submit]').click(); }
