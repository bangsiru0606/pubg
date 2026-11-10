import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// base './' + JS/CSS 인라인 → file:// 더블클릭 실행. public/assets 는 dist/assets 로 그대로 복사된다.
// mode=e2e 일 때만 테스트 전용 대사(dialogue.test-fixture.json)를 번들에 넣는다.
export default defineConfig(({ mode }) => ({
  define: { __TEST_FIXTURE__: JSON.stringify(mode === 'e2e') },
  base: './',
  plugins: [viteSingleFile()],
  build: { target: 'es2022', outDir: mode === 'e2e' ? '.tmp/e2e' : 'dist', chunkSizeWarningLimit: 2000 },
  test: { include: ['tests/**/*.test.ts'] },
}));
