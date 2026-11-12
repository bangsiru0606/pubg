import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import real from '../src/data/dialogue.json';
import characters from '../src/data/characters.json';
import { createGameState, markDialogueDone, openingNodeOf, startNodeOf, characterLabel, type Dialogues } from '../src/core';
import { areas, autoTriggered, nearest } from '../src/explore/interaction';
import { scaleFor } from '../src/ui/display';
import spec from '../art/asset-spec.json';

const D = real.dialogues as unknown as Dialogues;

describe('플레이 테스트 3차: 대사', () => {
  it('오프닝: 박은호가 인사·소개를 한 뒤 본론으로 들어간다 ({player} 토큰)', () => {
    const d = D.eunho_intro;
    expect(d.start).toBe('n0a');
    expect(d.nodes.n0a.text).toContain('{player} 탐정님');
    expect(d.nodes.n0a.next).toBe('n0b'); expect(d.nodes.n0b.speaker).toBe('han_jisu'); expect(d.nodes.n0c.next).toBe('n1');
    for (const n of ['n0a', 'n0b', 'n0c']) expect(d.nodes[n].source, n).toBe('new');
  });
  it('환자·직원 대화는 플레이어의 짧은 질문으로 시작하고, 인물마다 문장이 다르다', () => {
    const starts = ['choi_okja', 'han_yujin', 'chae_soyeon', 'oh_miran', 'baek_office', 'lee_hyejeong'].map((id) => D[id].nodes[D[id].start]);
    for (const n of starts) { expect(n.speaker).toBe('han_jisu'); expect(n.source).toBe('new'); expect(n.voice).toBeUndefined(); expect(n.text.length).toBeLessThan(45); }
    expect(new Set(starts.map((n) => n.text)).size).toBe(starts.length);
  });
  it('다시 말 걸기: 상태가 같으면 처음부터, 상태가 바뀌었으면 그 상태의 노드에서', () => {
    const s = createGameState(), d = D.oh_miran;
    expect(openingNodeOf(s, d, 'oh_miran')).toBe('o0');
    s.flags.push('oh_done'); // 완료 표시만 하던 restart 는 없다: 같은 대화를 처음부터 다시 재생한다
    expect(openingNodeOf(s, d, 'oh_miran')).toBe('o0');
    s.flags.push('oh_admitted'); // 상태가 바뀐 restart(인정한 뒤)는 유지
    expect(startNodeOf(s, d)).toBe('o3'); expect(openingNodeOf(s, d, 'oh_miran')).toBe('o3');
    markDialogueDone(s, d, 'oh_miran'); // 그 상태에서 끝까지 본 뒤 또 말을 걸면 새로 바뀐 것이 없다 → 처음부터
    expect(openingNodeOf(s, d, 'oh_miran')).toBe('o0');
    s.flags.push('evidence_new_state'); expect(openingNodeOf(s, d, 'oh_miran')).toBe('o0');
  });
  it('정하늘: "침대로 보내겠다" 표현이 없고 고백 문장이 바뀌었다', () => {
    const t = Object.values(D.jeong_haneul_final.nodes).map((n) => n.text).join('\n');
    expect(t).not.toContain('침대에 보내겠다'); expect(D.jeong_haneul_final.nodes.fc1.text).toContain('특별 치료로 보내겠다');
    expect(D.jeong_haneul_final.nodes.f7.text).toBe('알아요. 그 사람이 은지를 죽였다고 해서, 제가 한 일이 없던 일이 되는 건 아니라는 거.');
  });
  it('박은호의 메시지는 voice: message, 지하 첫 입장 독백은 2~3줄 inner', () => {
    expect(D.eunho_message.nodes.m1.voice).toBe('message');
    const m = Object.values(D.mono_basement_intro.nodes);
    expect(m.length).toBeGreaterThanOrEqual(2); expect(m.length).toBeLessThanOrEqual(3);
    for (const n of m) { expect(n.voice).toBe('inner'); expect(n.source).toBe('new'); }
  });
  it('신문 기사: 병원 측 발표만, 의혹 없음, 날짜는 8월 17일', () => {
    const t = D.closeup_newspaper.nodes.m.text;
    expect(t).toContain('이한신'); expect(t).toContain('8월 17일'); expect(t).toContain('지병');
    expect(t).not.toMatch(/의혹|수상|타살|조사/);
    expect(JSON.stringify(readFileSync('src/data/evidence.json', 'utf8'))).not.toContain('ev_newspaper'); // 단서 ID 를 만들지 않는다
  });
});

describe('플레이 테스트 3차: 맵·연출', () => {
  it('이혜정실 → 이사실: 방 이름·문 표시, 직함 이사, 문은 구역 경계에서 안쪽', () => {
    expect(areas.room_lee.name).toBe('이사실');
    const door = areas.floor3.interactables.find((i) => i.id === 'door_lee')!;
    expect(door.type === 'transition' && door.label).toContain('이사실');
    expect(door.x).toBeLessThanOrEqual(areas.floor3.walk!.max - 45); // 걷는 끝에서 안쪽
    expect(characterLabel('lee_hyejeong')).toBe('이혜정 이사'); expect(characters.characters.find((c) => c.id === 'lee_hyejeong')!.name).toBe('이혜정');
    expect(JSON.stringify(areas)).not.toContain('이혜정실');
  });
  it('지하: 올라가는 계단은 좌우 반전, 정하늘은 계단에서 걸어 들어와 보관함 옆에 남는다', () => {
    const up = areas.b1.interactables.find((i) => i.id === 'stairs_up')!;
    expect(up.type === 'transition' && up.flipArt).toBe(true);
    const h = areas.b1.interactables.find((i) => i.id === 'haneul_b1')!;
    expect(h.type === 'npc' && h.introScene).toBe('haneul_arrival');
    const steps = areas.b1.scenes!.haneul_arrival;
    expect(steps.some((s) => s.do === 'sfx' && s.id === 'onFootstep')).toBe(true); // 계단 쪽 발소리
    const walkIdx = steps.findIndex((s) => s.do === 'walk' && s.actor === 'npc:haneul_b1'), talkIdx = steps.findIndex((s) => s.do === 'dialogue');
    expect(walkIdx).toBeGreaterThan(0); expect(talkIdx).toBeGreaterThan(walkIdx); // 걸어 들어온 뒤 대화
    expect(steps.findIndex((s) => s.do === 'sfx')).toBeLessThan(walkIdx);
    const locker = areas.b1.interactables.find((i) => i.id === 'belongings')!;
    expect(Math.abs(h.x - locker.x)).toBeLessThan(100); // 유품 보관함 옆
  });
  it('정하늘은 고백 뒤에도 보고서 페이드까지 남지만 말을 걸 수 없고 다시 자동 시작하지 않는다', () => {
    const s = createGameState(); s.flags.push('diary_closed', 'haneul_confessed', 'flag_claim_d_open');
    expect(autoTriggered('b1', areas.b1, 400, s)?.id).toBe('scene6'); // 장면 6 사건이 이어진다
    const h = areas.b1.interactables.find((i) => i.id === 'haneul_b1')!;
    expect(nearest(areas.b1, h.x, s)?.id).not.toBe('haneul_b1'); // 말을 걸 수 없다
    expect(h.type === 'npc' && h.hideWhen).toBe('haneul_cleared'); // 정리는 보고서로 넘어갈 때
  });
  it('부원장 PC: 책상이 붙은 desk_pc 그림을 쓴다 (배치 8)', () => {
    const pc = areas.room_baek.interactables.find((i) => i.id === 'revision')!;
    expect(pc.type === 'examine' && pc.art).toBe('desk_pc');
    expect(pc.type === 'examine' && pc.artFallback).toBeUndefined();
    expect((spec.pending as string[])).not.toContain('desk_pc');
  });
  it('지하 첫 입장 컷신이 지도에 연결되어 있다 (그림은 pending)', () => {
    const st = areas.floor1.interactables.find((i) => i.id === 'stairs_b1')!;
    expect(st.type === 'transition' && st.cutscene).toBe('basement_intro');
    expect(st.type === 'transition' && st.cutsceneDialogue).toBe('mono_basement_intro');
    expect(spec.pending as string[]).toEqual([]);
  });
});

describe('플레이 테스트 3차: 화면', () => {
  it('정수 배율이 기본, 화면 채우기는 창에 맞는 소수 배율 (1920×1080 은 둘 다 ×4)', () => {
    expect(scaleFor(1920, 1080, 480, 270, false)).toBe(4); expect(scaleFor(1920, 1080, 480, 270, true)).toBe(4);
    expect(scaleFor(1366, 768, 480, 270, false)).toBe(2); expect(scaleFor(1366, 768, 480, 270, true)).toBeCloseTo(2.844, 2);
    expect(scaleFor(300, 200, 480, 270, false)).toBe(1); // 정수 배율은 1 미만으로 줄이지 않는다
  });
});
