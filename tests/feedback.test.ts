import { describe, expect, it } from 'vitest';
import evidence from '../src/data/evidence.json';
import real from '../src/data/dialogue.json';
import { areas } from '../src/explore/interaction';
import { GROUND_Y } from '../src/explore/interaction';
import assets from '../public/assets/assets.json';

type N = { speaker: string; text: string; source?: string; voice?: string };
const D = real.dialogues as unknown as Record<string, { nodes: Record<string, N> }>;
const nodes = Object.entries(D).flatMap(([id, d]) => Object.entries(d.nodes).map(([n, x]) => ({ key: `${id}:${n}`, id, n, x })));

describe('대사 표시 방식 (voice)', () => {
  it('독백(mono_*)·근접 조사 설명(closeup_*)·병원 도착 독백은 모두 inner', () => {
    for (const { key, id, x } of nodes) if (/^(mono_|closeup_)/.test(id)) expect(x.voice, key).toBe('inner');
    expect(Object.keys(D).filter((i) => i.startsWith('mono_')).length).toBeGreaterThanOrEqual(15);
  });
  it('주인공 생각 노드와 노크 소리 묘사의 분류', () => {
    const inner = nodes.filter((q) => q.x.voice === 'inner').map((q) => q.key).filter((k) => !/^(mono_|closeup_)/.test(k)).sort();
    expect(inner).toEqual(['baek_lobby:b6', 'eunho_message:a1', 'eunho_message:b4', 'eunho_message:bc', 'eunho_message:m2']);
    expect(D.intro_knock.nodes.k1.voice).toBe('action');
  });
  it('voice 가 inner·action 말고는 없고, 텍스트에 괄호를 직접 쓰지 않는다 (화면이 감싼다)', () => {
    for (const { key, x } of nodes) if (x.voice) { expect(['inner', 'action'], key).toContain(x.voice); expect(x.text.trim(), key).not.toMatch(/^\(|\)$/); }
  });
  it('주인공이 소리 내어 말하는 대사(질문·요구)는 voice 가 없다', () => {
    for (const k of ['baek_lobby:b2', 'baek_lobby:b4', 'eunho_intro:n2', 'jeong_haneul:h3', 'oh_miran:o7', 'chae_soyeon:s2']) expect(nodes.find((q) => q.key === k)!.x.voice, k).toBeUndefined();
  });
});

describe('새로 쓴 대사·잠김 독백·마스터키', () => {
  it('새 대사는 source: new', () => {
    for (const id of ['mono_hospital_intro', 'mono_office_locked', 'mono_director_locked', 'mono_basement_locked']) for (const [n, x] of Object.entries(D[id].nodes)) expect(x.source, `${id}:${n}`).toBe('new');
    expect(D.chae_soyeon.nodes.s4.source).toBe('new'); expect(D.chae_soyeon.nodes.s5.source).toBe('new');
  });
  it('requires 가 있는 이동 지점은 모두 lockedDialogue 가 있고, 지하 철창문은 잠김 독백이 있다', () => {
    for (const [aid, a] of Object.entries(areas)) for (const it of a.interactables) if (it.type === 'transition' && (it.requires || it.requiresEvidence?.length)) expect(it.lockedDialogue, `${aid}/${it.id}`).toBeTruthy();
    const st = areas.floor1.interactables.find((i) => i.id === 'stairs_b1');
    expect(st && 'lockedDialogue' in st && st.lockedDialogue).toBe('mono_basement_locked');
    expect(D.mono_basement_locked.nodes.m.text).toContain('철창문이 잠겨 있다');
  });
  it('채소연이 22:34 와 청소용 마스터키 분실을 직접 말하고, E06 설명에도 있다 (P02 22:34 칸을 진술로 추론)', () => {
    const t = Object.values(D.chae_soyeon.nodes).filter((x) => x.speaker === 'chae_soyeon').map((x) => x.text).join(' ');
    expect(t).toContain('10시 34분'); expect(t).toContain('청소용 마스터키'); expect(t).toContain('소등 방송');
    const e6 = (evidence as unknown as { id: string; description: string }[]).find((e) => e.id === 'E06_torn_sleeve')!;
    expect(e6.description).toContain('22시 34분'); expect(e6.description).toContain('마스터키');
  });
});

describe('벽 높이·맵 끝', () => {
  it('난간이 있는 벽은 아래로 내려 난간이 바닥에서 35~40px 에 온다 (원본 난간 ≈104px)', () => {
    for (const id of ['floor1', 'floor2', 'room_choi', 'room_han', 'room_jeong', 'floor3', 'room_baek', 'room_oh', 'room_lee', 'room_director']) {
      const off = areas[id].bg!.wallOffsetY ?? 0, rail = 104 - off;
      expect(rail, id).toBeGreaterThanOrEqual(35); expect(rail, id).toBeLessThanOrEqual(40);
    }
  });
  it('벽을 내려도 화면 맨 위에 빈틈이 없다 (내림 ≤ 벽 높이 - 바닥선)', () => {
    for (const [id, a] of Object.entries(areas)) { const wh = (assets as Record<string, { h: number }>)[a.bg!.wall].h; expect(a.bg!.wallOffsetY ?? 0, id).toBeLessThanOrEqual(wh - GROUND_Y); }
  });
  it('구역 폭은 카메라 폭(480) 이상', () => { for (const [id, a] of Object.entries(areas)) expect(a.maxX - a.minX, id).toBeGreaterThanOrEqual(480); });
});
