import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { creditsBlock, replaceBlock } from '../tools/readme-credits';

const readme = readFileSync('README.md', 'utf8');

describe('README (docs/이전계획.md 6.4 템플릿 순서)', () => {
  it('절 순서: 팀원 → 게임 소개 → 조작법 → 스크린샷 → 다운로드 → 실행 방법 → 사용 도구와 출처', () => {
    const order = ['# 병원의 고해', '## 팀원 소개', '## 게임 소개', '## 조작법', '## 스크린샷', '## ⬇️ 다운로드', '## ▶️ 실행 방법', '## 사용 도구와 출처'].map((h) => readme.indexOf(h));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('필수 내용: 약 30분, 엔딩 4종, 조작법 키, 릴리즈 링크, 압축 해제 안내', () => {
    for (const t of ['약 30분', '엔딩 4종', '`Shift`', '`Tab`', '`Esc`', '`M`', 'releases/tag/v1.0', '압축 해제 후 `index.html` 더블클릭']) expect(readme, t).toContain(t);
    expect(readme).toContain('TODO'); // 팀원 표는 마감 때 채운다
  });
  it('출처 구간은 CREDITS.md 로 다시 쓸 수 있고, 다른 곳은 건드리지 않는다', () => {
    const md = '| 곡 | 도구 |\n|---|---|\n| bgm_title | Eleven Music |\n- bgm_hospital: ACE-Step\n';
    const out = replaceBlock(readme, creditsBlock(md));
    expect(out).toContain('Eleven Music(ElevenLabs 무료 플랜)'); expect(out).toContain('ACE-Step으로 생성'); expect(out).toContain('bgm_title · Eleven Music');
    expect(out.slice(0, out.indexOf('<!-- credits:start'))).toBe(readme.slice(0, readme.indexOf('<!-- credits:start')));
    expect(out.slice(out.indexOf('<!-- credits:end -->'))).toBe(readme.slice(readme.indexOf('<!-- credits:end -->')));
    expect(creditsBlock(null)).toContain('배경음악**: 준비 중');
    expect(() => replaceBlock('없음', 'x')).toThrow();
  });
});
