import { chromium, type Browser } from 'playwright';

// 시스템 Chrome → Edge 순으로 사용 (Playwright 번들 브라우저 설치 불필요)
export async function launch(): Promise<Browser> {
  const ch = process.env.BROWSER ? [process.env.BROWSER] : ['chrome', 'msedge'];
  let err: unknown;
  for (const channel of ch) {
    try { return await chromium.launch({ channel }); } catch (e) { err = e; }
  }
  throw err;
}
