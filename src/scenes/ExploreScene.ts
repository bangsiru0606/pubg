import Phaser from 'phaser';
import {
  acquireEvidence, createGameState, evidenceById, hasFlag, isBasementOpen, loadGame, saveGame, shownEvidence, puzzles, setFlag, type GameState,
} from '../core';
import {
  GROUND_Y, PLAYER_SPEED, RUN_MULTIPLIER, START, areas, autoTriggered, facesLeft, fadeSeconds, flipFor, isAvailable, isHidden, nearest, promptOf, themes,
  triggerKey, talkStand, type Examine, type Interactable, type Npc, type Transition,
} from '../explore/interaction';
import { openCloseup } from '../ui/closeup';
import { openEnding, unsolvedClaimIds } from '../ui/ending';
import { openReport } from '../ui/report';
import { openTitle } from '../ui/title';
import { openCutscene } from '../ui/cutscene';
import { openPuzzle } from '../ui/puzzle';
import { hasDialogue, openDialogue, setThenHandler } from '../ui/dialogue';
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
  started = false;                 // 타이틀에서 새 게임/이어하기를 고른 뒤에만 자동 저장한다
  private reportCheckpoint = '';  // 씬 7 시작 시점 저장본(엔딩 D 재도전용)
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
    setTabHandler(() => { if (this.started && !this.busy && !isModalOpen()) openNotebook(this.state, () => {}); });
    setThenHandler((t) => { if (t === 'report') this.startReport(); });
    this.buildArea(START.area, START.x);
  }

  // ---------- 구역 구성 ----------
  private buildArea(id: string, spawnX: number) {
    const flip = this.player?.flipX ?? flipFor('player', false); // 처음엔 오른쪽을 본다
    this.children.removeAll(true);
    this.areaId = id;
    this.npcSprites.clear();
    this.state.currentSceneId = id;
    this.state.playerX = spawnX;
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

    for (const pr of a.props ?? []) {
      if (pr.showWhen && !hasFlag(this.state, pr.showWhen)) continue; // 예: 백선우가 떠난 뒤 놓이는 청소 카트 (아트 전까지 placeholder)
      this.add.rectangle(pr.x, g, pr.w, pr.h, Phaser.Display.Color.HexStringToColor(pr.color).color).setOrigin(0.5, 1).setDepth(4).setStrokeStyle(1, 0x000000, 0.6);
    }
    for (const it of a.interactables) if (!isHidden(it, this.state)) this.drawInteractable(a, it);

    if (this.started) saveGame(this.state);
    this.player = this.add.sprite(spawnX, g, 'player_idle_0').setOrigin(0.5, 1).setFlipX(flip).setDepth(6).play('player_idle');
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
      if (sprite) this.npcSprites.set(it.id, this.add.sprite(it.x, g, `${sprite}_idle_0`).setOrigin(0.5, 1).setFlipX(flipFor(sprite, a.npcFacing?.[it.id] === 'left')).setDepth(5).play(`${sprite}_idle`));
      else { // 회색 실루엣 placeholder (몸 + 머리)
        this.add.rectangle(it.x, g, 30, 66, 0x8a8f94).setOrigin(0.5, 1).setDepth(5);
        this.add.rectangle(it.x, g - 66, 22, 24, 0x8a8f94).setOrigin(0.5, 1).setDepth(5);
      }
    } else if ((a.theme !== 'office' || !it.closeup) && isAvailable(it, this.state)) {
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
    if (dir !== 0) p.setFlipX(flipFor('player', dir < 0));
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
    if (!isAvailable(it, this.state)) {
      if (it.type === 'transition' && it.lockedDialogue) { setPrompt(null); openDialogue(this.state, it.lockedDialogue); } // 잠긴 이유 한 줄 독백
      return;
    }
    if (it.type === 'transition') this.useTransition(it);
    else if (it.type === 'npc') this.talk(it);
    else if (it.closeup) { setPrompt(null); openCloseup(this.state, it.closeup, () => {}); }
    else if (it.puzzleId && (hasFlag(this.state, `puzzle_opened:${it.puzzleId}`) || !(it.evidenceId || it.evidenceIds || it.dialogueId))) this.puzzle(it.puzzleId); // 이미 한 번 열린 퍼즐은 다시 연다
    else if (it.evidenceId || it.evidenceIds || it.dialogueId) this.examine(it);
  }

  private useTransition(it: Transition) {
    const flag = it.cutscene ? `cutscene_done:${it.cutscene}` : '';
    if (!it.cutscene || hasFlag(this.state, flag)) { void this.go(it.to, it.spawnX); return; }
    setFlag(this.state, flag);
    this.busy = true; setPrompt(null);
    void fadeThrough(0.3, 0.3, () => openCutscene(it.cutscene!, () => { this.busy = false; void this.go(it.to, it.spawnX); }));
  }

  /** 조사 지점: 독백(dialogueId)이 있으면 독백 → 원문 보기, 없으면 바로 원문 보기. 이미 얻었으면 원문만 다시 연다. */
  private examine(it: Examine) {
    setPrompt(null);
    const ids = [...(it.evidenceId ? [it.evidenceId] : []), ...(it.evidenceIds ?? [])];
    const have = ids.length > 0 && ids.every((id) => this.state.evidenceIds.includes(id));
    if (it.dialogueId && !have) { openDialogue(this.state, it.dialogueId, (got) => this.showDocs(got)); return; }
    const fresh = ids.filter((id) => acquireEvidence(this.state, id));
    for (const id of fresh) showToast(`단서 획득: ${shownEvidence(this.state, id)!.title}`);
    this.showDocs(have ? ids : fresh);
  }

  /** 얻은 자료의 원문을 차례로 보여 준 뒤 화면을 갱신하고, 조건이 갖춰진 퍼즐을 자동으로 연다 */
  private showDocs(ids: string[]) {
    const next = ids.slice();
    const step = () => {
      const id = next.shift();
      if (id) { openViewer(this.state, id, () => { const f = evidenceById.get(id)?.afterView; if (f) setFlag(this.state, f); step(); }); return; }
      this.refresh();
      this.autoOpenPuzzle();
    };
    step();
  }

  private autoOpenPuzzle() {
    for (const p of puzzles) {
      if (!p.layout || !p.openWhen || this.state.solvedPuzzleIds.includes(p.id) || hasFlag(this.state, `puzzle_opened:${p.id}`)) continue;
      const w = p.openWhen;
      if (!(w.flags ?? []).every((f) => hasFlag(this.state, f)) || !(w.evidence ?? []).every((id) => this.state.evidenceIds.includes(id))) continue;
      setFlag(this.state, `puzzle_opened:${p.id}`);
      this.puzzle(p.id);
      return;
    }
  }

  private puzzle(id: string) {
    setPrompt(null);
    const p = puzzles.find((q) => q.id === id)!;
    const solvedText = () => { if (p.solvedDialogue) openDialogue(this.state, p.solvedDialogue, () => this.announceBasement()); };
    if (this.state.solvedPuzzleIds.includes(id)) { solvedText(); return; }
    openPuzzle(this.state, id, (solved) => { if (solved) { this.refresh(); solvedText(); } });
  }

  /** P03·P04 를 모두 풀면 지하 계단이 열렸음을 한 번 알린다 */
  private announceBasement() {
    if (!isBasementOpen(this.state) || hasFlag(this.state, 'basement_announced')) return;
    setFlag(this.state, 'basement_announced');
    openDialogue(this.state, 'mono_basement_open');
  }

  private talk(npc: Npc) {
    setPrompt(null);
    if (!hasDialogue(npc.dialogueId)) { showToast(`${npc.name}: (대사는 아직 없다)`); return; }
    if (!npc.silent) { // 장면 사건(silent)은 서지 않는다
      const st = talkStand(this.player.x, npc.x, this.minX, this.maxX); // 서로 마주 보고 최소 거리 확보
      this.player.x = st.x; this.player.setFlipX(flipFor('player', st.playerFacesLeft));
      const ns = this.npcSprites.get(npc.id);
      if (ns) ns.setFlipX(flipFor(areas[this.areaId].npcSprite![npc.id], !st.playerFacesLeft));
    }
    openDialogue(this.state, npc.dialogueId, (got) => this.showDocs(got.filter((id) => shownEvidence(this.state, id)?.body)));
  }

  // ---------- 시작·씬 7·엔딩 ----------
  newGame() { this.state = createGameState(); this.started = true; this.buildArea(START.area, START.x); }
  continueGame(st: GameState) { this.state = st; this.started = true; this.buildArea(st.currentSceneId, st.playerX); }

  /** 씬 7: 시작 시점을 저장해 두고(엔딩 D 재도전용) 최종 보고서를 연다 */
  private startReport() {
    setPrompt(null);
    this.reportCheckpoint = JSON.stringify(this.state);
    saveGame(this.state, undefined, 'report');
    openReport(this.state, () => this.showEnding());
  }

  private showEnding() {
    const unsolved = unsolvedClaimIds(this.state);
    openEnding(this.state, {
      onRetry: () => this.retryReport(unsolved),
      onRestart: () => this.newGame(),
      onTitle: () => this.openTitle(),
    });
  }

  /** 엔딩 D: 씬 7 시작 시점으로 돌아가 보고서를 다시 쓴다. 미해결 질문과 관련된 단서를 수첩에서 먼저 보여 준다. */
  private retryReport(unsolved: string[]) {
    const saved = this.reportCheckpoint ? (JSON.parse(this.reportCheckpoint) as GameState) : loadGame(undefined, 'report');
    if (!saved) { this.newGame(); return; }
    saved.retryClaimIds = unsolved;
    this.state = saved;
    this.buildArea(saved.currentSceneId, saved.playerX);
    this.startReport();
  }

  openTitle() {
    this.started = false;
    openTitle({ canContinue: loadGame() !== null, onNew: () => this.newGame(), onContinue: () => { const st = loadGame(); if (st) this.continueGame(st); else this.newGame(); } });
  }

  /** 같은 자리에서 구역을 다시 그린다 (NPC 퇴장, 소품 등장 반영) */
  refresh() { if (!this.busy) this.buildArea(this.areaId, this.player.x); }

  /** 구역 전환 + 페이드. 이미 방문한 구역은 0.4초 이하. */
  go(to: string, spawnX: number): Promise<void> {
    if (this.busy) return Promise.resolve();
    this.busy = true;
    setPrompt(null);
    const f = fadeSeconds(this.state.visitedAreaIds.includes(to));
    return fadeThrough(f.out, f.in, () => this.buildArea(to, spawnX)).then(() => { this.busy = false; });
  }

  playerFacesLeft() { return facesLeft('player', this.player.flipX); }
  teleportX(x: number) { this.player.x = Phaser.Math.Clamp(x, this.minX, this.maxX); } // e2e 전용 훅에서만 사용
  hasFlag(f: string) { return hasFlag(this.state, f); }
}
