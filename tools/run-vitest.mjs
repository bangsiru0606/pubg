// npm test 진입점. Windows 에서 셸이 소문자 드라이브(d:\game)로 시작하면 vitest 가 같은 파일을 두 경로(d:/… · D:/…)로 불러와
// 모든 테스트가 "Cannot read properties of undefined (reading 'config')" 로 실패한다. 실제 대소문자의 경로로 고정해서 실행한다 (이전계획 11.15).
import { realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = realpathSync.native(process.cwd());
const bin = join(root, 'node_modules', 'vitest', 'vitest.mjs');
const r = spawnSync(process.execPath, [bin, 'run', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit', env: { ...process.env, INIT_CWD: root } });
process.exit(r.status ?? 1);
