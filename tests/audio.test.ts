import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import audio from '../src/data/audio.json';
import real from '../src/data/dialogue.json';
import endings from '../src/data/endings.json';
import { areas } from '../src/explore/interaction';
import { canPlay, loopEnvelope, pickBgm, resolveTrack, sfxGain, sfxVariants, bgmGain } from '../src/audio/resolve';
import { checkAudio, parseCredits } from '../tools/audio-assets';

const TRACKS = ['bgm_title', 'bgm_office', 'bgm_hospital', 'bgm_interrogation', 'bgm_basement', 'bgm_confession', 'bgm_report', 'bgm_ending_light', 'bgm_ending_dark'];
const SFX = ['knock', 'door_open', 'door_close', 'stairs', 'footstep', 'page_flip', 'evidence_get', 'statement_update', 'puzzle_correct', 'puzzle_wrong', 'hint', 'ui_move', 'ui_confirm', 'type_blip', 'broadcast_chime', 'heartbeat', 'transfer_done', 'fade_whoosh'];
const src = (f: string) => readFileSync(f, 'utf8');
const fb = audio.bgm.fallback as Record<string, string>;

describe('소리 데이터 (docs/사운드_계획.md)', () => {
  it('트랙 9곡·효과음 18종 이름이 계획서와 같다', () => {
    expect(Object.keys(audio.bgm.tracks).sort()).toEqual([...TRACKS].sort());
    expect(Object.keys(audio.sfx.sounds).sort()).toEqual([...SFX].sort());
    expect([...new Set(Object.values(audio.sfx.events))].sort()).toEqual([...SFX].sort()); // 18종 모두 이벤트에 연결됨
  });
  it('audio.json 참조 무결성 (구역·대사·노드·엔딩·트랙·효과음)', () => {
    const nodes = new Set<string>(); const ids = new Set(Object.keys(real.dialogues));
    for (const [id, d] of Object.entries(real.dialogues) as [string, { nodes: Record<string, unknown> }][]) for (const n of Object.keys(d.nodes)) nodes.add(`${id}:${n}`);
    const r = checkAudio(audio as never, { bgm: [], sfx: [] }, { dialogues: ids, nodes, areas: new Set(Object.keys(areas)), endings: new Set((endings.endings as { id: string }[]).map((e) => e.id)) });
    expect(r.errors).toEqual([]);
  });
  it('모든 구역에 BGM 이 지정되어 있다', () => { for (const id of Object.keys(areas)) expect(audio.bgm.area, id).toHaveProperty(id); });
});

describe('트랙 대체·변주·음량 (순수 계산)', () => {
  it('대체 규칙: office→title, interrogation·report→hospital, 없으면 무음', () => {
    expect(fb).toEqual({ bgm_office: 'bgm_title', bgm_interrogation: 'bgm_hospital', bgm_report: 'bgm_hospital' });
    expect(resolveTrack('bgm_office', ['bgm_title'], fb)).toBe('bgm_title');
    expect(resolveTrack('bgm_office', ['bgm_office', 'bgm_title'], fb)).toBe('bgm_office');
    expect(resolveTrack('bgm_interrogation', ['bgm_hospital'], fb)).toBe('bgm_hospital');
    expect(resolveTrack('bgm_report', ['bgm_hospital'], fb)).toBe('bgm_hospital');
    expect(resolveTrack('bgm_basement', ['bgm_hospital'], fb)).toBeNull();
    expect(resolveTrack('bgm_office', [], fb)).toBeNull();
    expect(resolveTrack(null, ['bgm_title'], fb)).toBeNull();
    expect(resolveTrack('a', ['x'], { a: 'b', b: 'a' })).toBeNull(); // 순환 대체도 멈춘다
  });
  it('쌓인 요청 중 파일이 있는 가장 나중 것을 쓰고, 모두 없으면 기본 트랙', () => {
    const stack = new Map([['dialogue', 'bgm_confession']]);
    expect(pickBgm('bgm_hospital', stack, ['bgm_hospital'], fb)).toBe('bgm_hospital'); // confession 파일이 없으면 구역 음악 유지
    expect(pickBgm('bgm_hospital', stack, ['bgm_hospital', 'bgm_confession'], fb)).toBe('bgm_confession');
    expect(pickBgm(null, new Map(), [], fb)).toBeNull();
  });
  it('효과음 변주: type_blip_1~3, footstep1·2 를 찾는다', () => {
    expect(sfxVariants('type_blip', ['type_blip_1', 'type_blip_2', 'type_blip_3', 'typed'])).toEqual(['type_blip_1', 'type_blip_2', 'type_blip_3']);
    expect(sfxVariants('footstep', ['footstep1', 'footstep2', 'footstep_extra'])).toEqual(['footstep1', 'footstep2']);
    expect(sfxVariants('knock', ['knock'])).toEqual(['knock']);
    expect(sfxVariants('knock', [])).toEqual([]);
  });
  it('음량: 마스터×채널, 음소거면 0, 범위 0~1, 같은 소리는 3개까지', () => {
    expect(bgmGain({ master: 0.5, bgm: 0.5, sfx: 1, muted: false })).toBeCloseTo(0.25);
    expect(sfxGain({ master: 1, bgm: 1, sfx: 0.5, muted: false }, 0.6)).toBeCloseTo(0.3);
    expect(bgmGain({ master: 1, bgm: 1, sfx: 1, muted: true })).toBe(0);
    expect(sfxGain({ master: 2, bgm: 1, sfx: Number.NaN, muted: false })).toBe(0);
    expect([0, 1, 2, 3].map((n) => canPlay(n))).toEqual([true, true, true, false]);
  });
  it('루프 앞뒤 페이드: 시작·끝에서 0, 가운데 1, 길이를 모르면 1', () => {
    expect(loopEnvelope(0, 60, 1.5)).toBe(0); expect(loopEnvelope(30, 60, 1.5)).toBe(1); expect(loopEnvelope(60, 60, 1.5)).toBe(0);
    expect(loopEnvelope(0.75, 60, 1.5)).toBeCloseTo(0.5); expect(loopEnvelope(5, Number.NaN, 1.5)).toBe(1);
  });
  it('CREDITS.md 는 화면용 줄로 바뀐다', () => {
    expect(parseCredits('# BGM 출처\n\n| 곡 | 도구 |\n|---|---|\n| bgm_title | **Eleven Music** |\n- bgm_hospital: ACE-Step\n')).toEqual(['BGM 출처', '곡 · 도구', 'bgm_title · Eleven Music', 'bgm_hospital: ACE-Step']);
  });
});

describe('정답·오답 누설 금지', () => {
  const calls = (f: string) => [...src(f).matchAll(/sfx\('(\w+)'\)/g)].map((m) => m[1]);
  it('결론 저장(수첩)은 결과와 무관한 ui_confirm 하나뿐이고 퍼즐 결과음은 쓰지 않는다', () => {
    expect(audio.sfx.events.onUiConfirm).toBe('ui_confirm');
    const nb = src('src/ui/notebook.ts');
    expect(new Set(calls('src/ui/notebook.ts'))).toEqual(new Set(['onPageFlip', 'onUiConfirm']));
    const at = nb.indexOf("sfx('onUiConfirm')"), save = nb.indexOf('saveConclusion(s, c.claimId');
    expect(at).toBeGreaterThan(save); // 저장 시도 뒤, r.ok 와 무관하게
    expect(nb.slice(save, at)).not.toMatch(/if \(r\.ok\)|r\.ok\s*\?.*sfx/);
    for (const f of ['src/ui/report.ts', 'src/ui/ending.ts']) for (const c of calls(f)) expect(c, f).toBe('onUiConfirm');
  });
  it('퍼즐 결과음은 확인 버튼(submit) 안에서만 나고, 한 번씩만 쓴다', () => {
    const p = src('src/ui/puzzle.ts');
    for (const ev of ['onPuzzleCorrect', 'onPuzzleWrong']) expect(p.split(`sfx('${ev}')`).length - 1, ev).toBe(1);
    const a = p.indexOf('function submit()'), b = p.indexOf('const close =');
    for (const ev of ['onPuzzleCorrect', 'onPuzzleWrong', 'onHint']) { const i = p.indexOf(`sfx('${ev}')`); expect(i, ev).toBeGreaterThan(a); expect(i, ev).toBeLessThan(b); }
    expect(p.slice(a, b)).toContain('submitPuzzle(s, puzzleId'); // submit 안에서 판정 후
    for (const f of readdirSync('src/ui').filter((x) => x.endsWith('.ts') && x !== 'puzzle.ts')) expect(src(`src/ui/${f}`), f).not.toMatch(/onPuzzle(Correct|Wrong)/);
  });
  it('core 는 오디오를 모른다', () => { for (const f of readdirSync('src/core')) expect(src(`src/core/${f}`), f).not.toMatch(/audio|Audio/); });
  it('코드가 부르는 모든 이벤트 이름은 audio.json events 에 있다', () => {
    const files = ['src/ui', 'src/scenes', 'src/audio'].flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.ts')).map((f) => `${d}/${f}`));
    for (const f of files) for (const m of src(f).matchAll(/sfx\('(\w+)'\)/g)) expect(audio.sfx.events, `${f}: ${m[1]}`).toHaveProperty(m[1]);
  });
});
