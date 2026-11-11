// README.md 의 "사용 도구와 출처" 구간(credits:start ~ credits:end)을 art/source/audio/bgm/CREDITS.md 로 다시 쓴다.
//   npm run readme:credits        → README.md 갱신
// CREDITS.md 가 없으면 "배경음악: 준비 중". 무료 플랜 Eleven Music 은 출처 표기가 필수라, 곡 목록에 도구가 보이면 표기 문구를 덧붙인다.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseCredits } from './audio-assets';

const START = '<!-- credits:start', END = '<!-- credits:end -->';

export function creditsBlock(creditsMd: string | null): string {
  const lines = creditsMd ? parseCredits(creditsMd) : [];
  const text = lines.join('\n');
  const bgm = !lines.length ? ['- **배경음악**: 준비 중']
    : [`- **배경음악** (곡별 출처):`, ...lines.map((l) => `  - ${l}`),
      ...(/eleven/i.test(text) ? ['  - 배경음악 일부는 Eleven Music(ElevenLabs 무료 플랜)으로 생성했다. 비상업적 이용.'] : []),
      ...(/ace-?step/i.test(text) ? ['  - 배경음악 일부는 ACE-Step으로 생성했다.'] : [])];
  return ['- **그림**: Codex(`$imagegen`)로 생성. 탐색 화면의 기준 그림체는 craft_on 기존 에셋.', '- **개발**: Claude Code, Codex', '- **효과음**: 코드로 직접 합성 (외부 음원 없음)', ...bgm].join('\n');
}

/** README 본문에서 구간만 교체한다 (구간이 없으면 오류) */
export function replaceBlock(readme: string, block: string): string {
  const a = readme.indexOf(START), s = a < 0 ? -1 : readme.indexOf('\n', a), b = readme.indexOf(END);
  if (a < 0 || b < 0) throw new Error('README.md 에 credits:start / credits:end 표시가 없다');
  return `${readme.slice(0, s + 1)}${block}\n${readme.slice(b)}`;
}

if (process.argv[1]?.endsWith('readme-credits.ts')) {
  const md = 'art/source/audio/bgm/CREDITS.md';
  const next = replaceBlock(readFileSync('README.md', 'utf8'), creditsBlock(existsSync(md) ? readFileSync(md, 'utf8') : null));
  writeFileSync('README.md', next);
  console.log('README.md 사용 도구와 출처 구간을 갱신했다.');
}
