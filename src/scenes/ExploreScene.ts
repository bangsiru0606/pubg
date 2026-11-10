import Phaser from 'phaser';
import {
  acquireEvidence, evidenceById, hasFlag, setFlag, type GameState,
} from '../core';
import {
  GROUND_Y, PLAYER_SPEED, RUN_MULTIPLIER, START, areas, autoTriggered, fadeSeconds, isAvailable, nearest, promptOf, themes,
  triggerKey, talkStand, type Interactable, type Npc,
} from '../explore/interaction';
import { openCloseup } from '../ui/closeup';
import { hasDialogue, openDialogue } from '../ui/dialogue';
import { fadeThrough, setPrompt, showToast } from '../ui/hud';
import { consumePress, isHeld, isModalOpen, setTabHandler } from '../ui/input';
import { openNotebook } from '../ui/notebook';
import { openViewer } from '../ui/viewer';

const A = 'assets/';
const PLAYER_FRAMES = ['idle_0', 'idle_1', 'walk_0', 'walk_1', 'walk_2', 'walk_3'];
const EUNHO_FRAMES = ['idle_0', 'idle_1', 'walk_0', 'walk_1', 'walk_2', 'walk_3', 'walk_4', 'walk_5'];
const OFFICE_ART = ['wall', 'floor', 'floor_topband', 'window', 'desk_bg', 'evidence_board', 'door'];

export class ExploreScene extends Phaser.Scene {
  state!: GameState;
  player!: Phaser.GameObjects.Sprite;
  areaId = START.area;
  busy = false; // 전환 중
  private minX = 0;
  private maxX = 0;
  private npcSprites = new Map<string, Phaser.GameObjects.Sprite>();

  constructor() { super('Explore'); }

  preload() {
    for (const id of OFFICE_ART) this.load.image(id, `${A}${id}.png`);
    for (const f of PLAYER_FRAMES) this.load.image(`player_${f}`, `${A}player_${f}.png`);
    for (const f of EUNHO_FRAMES) this.load.image(`eunho_${f}`, `${A}eunho_${f}.png`);
  }

  create() {
    const anim = (key: string, prefix: string, frames: string[], frameRate: number) =>
      this.anims.create({ key, frameRate, repeat: -1, frames: frames.map((f) => ({ key: `${prefix}_${f}` })) });
    anim('player_walk', 'player', ['walk_0', 'walk_1', 'walk_2', 'walk_3'], 8);
    anim('player_idle', 'player', ['idle_0', 'idle_1'], 2);
    anim('eunho_idle', 'eunho', ['idle_0', 'idle_1'], 2);
    setTabHandler(() => { if (!this.busy && !isModalOpen()) openNotebook(this.state, () => {}); });
    this.buildArea(START.area, START.x);
  }

  // ---------- 구역 구성 ----------
  private buildArea(id: string, spawnX: number) {
    this.children.removeAll(true);
    this.areaId = id;
    this.npcSprites.clear();
    this.state.currentSceneId = id;
    if (!this.state.visitedAreaIds.includes(id)) this.state.visitedAreaIds.push(id);
    const a = areas[id], g = GROUND_Y, w = a.maxX - a.minX;
    this.minX = a.minX; this.maxX = a.maxX;

    if (a.theme === 'office') {
      const tex = (k: string) => this.textures.get(k).getSourceImage() as HTMLImageElement;
      const tile = (k: string, y: number, depth: number) => this.add.tileSprite(a.minX, y, w, tex(k).height, k).setOrigin(0, 0).setDepth(depth);
      tile('wall', g - tex('wall').height, 0); tile('floor', g, 1); tile('floor_topband', g - tex('floor_topband').height, 2);
      for (const o of a.objects ?? []) this.add.image(o.x, g - o.bottom, o.tex).setOrigin(0.5, 1).setDepth(o.tex === 'door' ? 4 : 3);
    } else { // 아트가 없는 구역: 색 사각형 placeholder (이전계획 3.3)
      const t = themes[a.theme];
      this.add.rectangle(a.minX, g - 270, w, 270, Phaser.Display.Color.HexStringToColor(t.wall).color).setOrigin(0, 0).setDepth(0);
      this.add.rectangle(a.minX, g, w, 270 - g, Phaser.Display.Color.HexStringToColor(t.floor).color).setOrigin(0, 0).setDepth(1);
      this.add.rectangle(a.minX, g, w, 2, 0x000000, 0.35).setOrigin(0, 0).setDepth(2);
    }

    for (const it of a.interactables) this.drawInteractable(a, it);

    this.player = this.add.sprite(spawnX, g, 'player_idle_0').setOrigin(0.5, 1).setDepth(6).play('player_idle');
    const cam = this.cameras.main;
    cam.setBounds(a.minX, 0, w, 270);
    cam.startFollow(this.player, true);
    cam.centerOn(this.player.x, 135);
  }

  private drawInteractable(a: (typeof areas)[string], it: Interactable) {
    const g = GROUND_Y;
    if (it.type === 'transition') {
      if (a.theme === 'office') return; // 사무실 문은 아트가 있다
      const stairs = it.kind === 'stairs';
      this.add.rectangle(it.x, g, stairs ? 56 : 40, stairs ? 96 : 104, stairs ? 0x8a9096 : 0x2a2622).setOrigin(0.5, 1).setDepth(3).setStrokeStyle(1, 0x000000, 0.6);
      if (stairs) for (let i = 1; i < 5; i++) this.add.rectangle(it.x, g - i * 18, 56, 1, 0x000000, 0.35).setOrigin(0.5, 1).setDepth(4);
    } else if (it.type === 'npc') {
      const sprite = a.npcSprite?.[it.id];
      if (sprite) this.npcSprites.set(it.id, this.add.sprite(it.x, g, `${sprite}_idle_0`).setOrigin(0.5, 1).setFlipX(!!a.flipNpc?.includes(it.id)).setDepth(5).play(`${sprite}_idle`));
      else { // 회색 실루엣 placeholder (몸 + 머리)
        this.add.rectangle(it.x, g, 30, 66, 0x8a8f94).setOrigin(0.5, 1).setDepth(5);
        this.add.rectangle(it.x, g - 66, 22, 24, 0x8a8f94).setOrigin(0.5, 1).setDepth(5);
      }
    } else if (a.theme !== 'office' || !it.closeup) {
      this.add.rectangle(it.x, g - 14, 12, 12, 0xe8d36a).setAngle(45).setDepth(5).setStrokeStyle(1, 0x000000, 0.6); // 조사 지점
    }
  }

  // ---------- 매 프레임 ----------
  update(_t: number, dt: number) {
    if (this.busy || isModalOpen()) { this.player.anims.currentAnim?.key !== 'player_idle' && this.player.play('player_idle'); return; }
    const dir = (isHeld('ArrowRight') || isHeld('d') ? 1 : 0) - (isHeld('ArrowLeft') || isHeld('a') ? 1 : 0);
    const speed = PLAYER_SPEED * (isHeld('Shift') ? RUN_MULTIPLIER : 1);
    const p = this.player;
    p.x = Phaser.Math.Clamp(p.x + dir * speed * (dt / 1000), this.minX, this.maxX);
    if (dir !== 0) p.setFlipX(dir < 0);
    const want = dir !== 0 ? 'player_walk' : 'player_idle';
    if (p.anims.currentAnim?.key !== want) p.play(want);

    const area = areas[this.areaId];
    const auto = autoTriggered(this.areaId, area, p.x, this.state);
    if (auto) { setFlag(this.state, triggerKey(this.areaId, auto.id)); this.talk(auto); return; }

    const it = nearest(area, p.x, this.state);
    setPrompt(it ? promptOf(it) : null);
    if (it && consumePress('Enter')) this.interact(it);
  }

  // ---------- 상호작용 ----------
  private interact(it: Interactable) {
    if (!isAvailable(it, this.state)) return;
    if (it.type === 'transition') this.go(it.to, it.spawnX);
    else if (it.type === 'npc') this.talk(it);
    else if (it.closeup) { setPrompt(null); openCloseup(it.closeup, () => {}); }
    else if (it.evidenceId) {
      const id = it.evidenceId;
      if (acquireEvidence(this.state, id)) showToast(`단서 획득: ${evidenceById.get(id)!.title}`);
      setPrompt(null);
      openViewer(this.state, id);
    }
  }

  private talk(npc: Npc) {
    setPrompt(null);
    const st = talkStand(this.player.x, npc.x, this.minX, this.maxX); // 서로 마주 보고 최소 거리 확보
    this.player.x = st.x; this.player.setFlipX(st.playerFacesLeft);
    this.npcSprites.get(npc.id)?.setFlipX(!st.playerFacesLeft);
    if (!hasDialogue(npc.dialogueId)) { showToast(`${npc.name}: (대사는 4단계부터 들어간다)`); return; }
    openDialogue(this.state, npc.dialogueId, () => {});
  }

  /** 구역 전환 + 페이드. 이미 방문한 구역은 0.4초 이하. */
  go(to: string, spawnX: number): Promise<void> {
    if (this.busy) return Promise.resolve();
    this.busy = true;
    setPrompt(null);
    const f = fadeSeconds(this.state.visitedAreaIds.includes(to));
    return fadeThrough(f.out, f.in, () => this.buildArea(to, spawnX)).then(() => { this.busy = false; });
  }

  teleportX(x: number) { this.player.x = Phaser.Math.Clamp(x, this.minX, this.maxX); } // e2e 전용 훅에서만 사용
  hasFlag(f: string) { return hasFlag(this.state, f); }
}
