// npm run play: 제출용 zip 빌드를 만들고 압축을 푼 index.html 을 기본 브라우저로 연다 (더블클릭 실행과 같은 file:// 환경).
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

execSync('npm run build:release', { stdio: 'inherit' });
const index = resolve('release/ConfessionWard_v1.0_web/index.html');
if (process.platform === 'win32') execSync(`start "" "${index}"`, { shell: 'cmd.exe', stdio: 'ignore' });
else execSync(`${process.platform === 'darwin' ? 'open' : 'xdg-open'} "${index}"`, { stdio: 'ignore' });
console.log(`열었다: ${index}`);
