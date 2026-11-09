// dev/preview 없이 release 빌드를 열어 사무실 화면을 ×4(1920×1080)로 캡처
import AdmZip from 'adm-zip';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser';

const dir = mkdtempSync(join(tmpdir(), 'cw-'));
new AdmZip('release/ConfessionWard_v1.0_web.zip').extractAllTo(dir, true);
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(pathToFileURL(join(dir, 'ConfessionWard_v1.0_web', 'index.html')).href);
await page.waitForFunction(() => (window as any).__game?.scene.getScene('Explore')?.player);
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(1200); // 책상~창문~증거보드가 보이는 위치로
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(300);
await page.screenshot({ path: process.argv[2] ?? 'docs/screenshots/stage1_office.png' });
await browser.close();
