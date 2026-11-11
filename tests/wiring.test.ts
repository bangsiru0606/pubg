import { describe, expect, it } from 'vitest';
import characters from '../src/data/characters.json';
import real from '../src/data/dialogue.json';
import { areas } from '../src/explore/interaction';
import { PROP_HEIGHT } from '../tools/import-generated';

// docs/에셋_생성_프롬프트.md 배치 4·5 파일명
const WALLS = ['director_wall', 'ward_wall', 'patientroom_wall', 'staff_wall', 'nurse_wall', 'basement_wall', 'lobby_wall', 'wall'];
const FLOORS = ['wood_floor', 'ward_floor', 'basement_floor', 'lobby_floor_v2', 'floor'];
const PROPS = ['door_hospital', 'door_director', 'door_staff', 'stairs_up', 'stairs_down', 'stairs_basement', 'cleaning_cart', 'papers_floor', 'altar', 'blood_mark', 'director_desk', 'director_chair', 'order_emblem', 'bed_ward', 'bed_empty', 'broadcast_board', 'baek_pc', 'nurse_counter', 'lee_desk', 'ledger_shelf', 'code_chart', 'belongings_locker', 'cold_crate', 'floor_plan_board', 'stairs_basement_closed'];

describe('배치 3~5 미리 연결', () => {
  it('구역 배경 키는 모두 프롬프트 문서의 파일명이다', () => {
    for (const [id, a] of Object.entries(areas)) {
      if (id === 'office') continue;
      expect(a.bg, id).toBeDefined();
      expect(WALLS, `${id} wall`).toContain(a.bg!.wall); expect(FLOORS, `${id} floor`).toContain(a.bg!.floor);
    }
  });
  it('소품·문·계단·조사 지점 그림 키는 배치 5 파일명이고 높이 초안이 있다', () => {
    const keys = new Set<string>();
    for (const a of Object.values(areas)) {
      (a.objects ?? []).forEach((o) => keys.add(o.tex)); (a.props ?? []).forEach((p) => p.tex && keys.add(p.tex));
      for (const it of a.interactables) { if ('art' in it && it.art) keys.add(it.art); if ('artLocked' in it && it.artLocked) keys.add(it.artLocked); }
    }
    for (const k of keys) if (k !== 'door' && k !== 'window' && k !== 'desk_bg' && k !== 'evidence_board') { expect(PROPS, k).toContain(k); expect(PROP_HEIGHT[k], k).toBeGreaterThan(0); }
    // 배치 5 의 23개 중 쓰이지 않는 것이 없다
    expect([...keys].filter((k) => PROPS.includes(k)).sort()).toEqual([...PROPS].sort());
  });
  it('초상: 생성 인물의 대사 표정은 characters.json 의 expressions 안에 있다', () => {
    const ch = new Map((characters.characters as { id: string; portrait: string | null; expressions?: string[] }[]).map((c) => [c.id, c]));
    let n = 0;
    for (const d of Object.values(real.dialogues) as { nodes: Record<string, { speaker: string; portrait?: string }> }[])
      for (const node of Object.values(d.nodes)) {
        const c = ch.get(node.speaker);
        if (node.portrait && c?.expressions) { n++; expect(c.expressions.map((x) => `${c.portrait}_${x}`)).toContain(node.portrait); }
      }
    expect(n).toBeGreaterThan(20);
    for (const id of ['oh_miran', 'lee_hyejeong', 'choi_okja', 'han_yujin', 'chae_soyeon', 'jeong_haneul']) expect(ch.get(id)!.expressions).toHaveLength(3);
  });
});
