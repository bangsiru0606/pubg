// dist(index.html 인라인 + assets) → release/ConfessionWard_v1.0_web/ + 같은 이름의 zip
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import AdmZip from 'adm-zip';

const NAME = 'ConfessionWard_v1.0_web';
execSync('npm run build', { stdio: 'inherit' });
rmSync('release', { recursive: true, force: true });
mkdirSync(`release/${NAME}`, { recursive: true });
cpSync('dist/index.html', `release/${NAME}/index.html`);
cpSync('dist/assets', `release/${NAME}/assets`, { recursive: true });
const zip = new AdmZip();
zip.addLocalFolder(`release/${NAME}`, NAME);
zip.writeZip(`release/${NAME}.zip`);
console.log(`release/${NAME}.zip`);
