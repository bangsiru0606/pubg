import Phaser from 'phaser';
import assetList from '../../public/assets/assets.json';
import spec from '../../art/asset-spec.json';
import { areaTrack, bgmBase, sceneTrack, sfx, transitionSfx } from '../audio/audio';
import { openNamePopup } from '../ui/namepopup';
import {
  acquireEvidence, createGameState, evidenceById, hasFlag, isBasementOpen, loadGame, saveGame, setPlayerName, shownEvidence, puzzles, setFlag, type GameState,
} from '../core';
import {
  GROUND_Y, OPENING, PLAYER_SPEED, RUN_MULTIPLIER, START, areas, autoTriggered, facesLeft, fadeSeconds, flipFor, isAvailable, isHidden, nearest, showsSparkle, walkFlip, promptOf, themes,
  triggerKey, talkStand, type Examine, type OpeningStep, type Interactable, type Npc, type Transition,
} from '../explore/interaction';
import { openCloseup } from '../ui/closeup';
import { openEnding, unsolvedClaimIds } from '../ui/ending';
import { openReport } from '../ui/report';
import { openTitle } from '../ui/title';
import { openCutscene } from '../ui/cutscene';
import { openPuzzle } from '../ui/puzzle';
import { hasDialogue, openDialogue, setThenHandler } from '../ui/dialogue';
import { fadeThrough, queueHints, setPrompt, showToast } from '../ui/hud';
import { clearInput, consumePress, isEnterHeld, isHeld, isModalOpen, setTabHandler } from '../ui/input';
import { openNotebook } from '../ui/notebook';
import { openViewer } from '../ui/viewer';

const A = 'assets/';
const CAMERA_MARGIN = 80; // 갈 수 없는 곳(계단 너머)을 이만큼까지 검게 보여 준다
const SKIP_HOLD_MS = 600; // 컷신 연출 구간은 Enter 를 이만큼 길게 누르면 건너뛴다

export class ExploreScene extends Phaser.Scene {
  state!: GameState;
  player!: Phaser.GameObjects.Sprite;
  areaId = START.area;
  busy = false; // 전환 중
  private minX = 0;  // 플레이어가 갈 수 있는 범위 (walk 가 있으면 그것, 없으면 구역 범위)
  private maxX = 0;
  private camMin = 0;   // 카메라가 비출 수 있는 범위 (갈 수 없는 곳은 검은색)
  private camMax = 0;
  private scripted = new Set<Phaser.GameObjects.Sprite>(); // 연출이 직접 걷게 하는 스프라이트: 잠금 중에도 걷기 그림을 유지한다
  started = false;                 // 타이틀에서 새 게임/이어하기를 고른 뒤에만 자동 저장한다
  private reportCheckpoint = '';  // 씬 7 시작 시점 저장본(엔딩 D 재도전용)
  private npcSprites = new Map<string, Phaser.GameObjects.Sprite>();
  locked = false;                  // 오프닝 연출 중에는 이동·상호작용·Tab 을 잠근다
  private skip = false;
  private heldMs = 0;
  private lastDt = 16;
  private camPan: { obj: Phaser.GameObjects.Sprite; smooth: number } | null = null;
  private actors = new Map<string, Phaser.GameObjects.Sprite>();
  private stepMs = 0; // 발소리 간격

  constructor() { super('Explore'); }

  preload() {
    // 정규화된 모든 에셋(public/assets/assets.json)을 같은 키로 불러온다. 지도 데이터가 키를 지정하고, 없는 키는 색 사각형으로 대체된다.
    for (const id of Object.keys(assetList)) this.load.image(id, `${A}${id}.png`);
  }

  create() {
    const anim = (key: string, prefix: string, frames: string[], frameRate: number) =>
      this.anims.create({ key, frameRate, repeat: -1, frames: frames.map((f) => ({ key: `${prefix}_${f}` })) });
    anim('player_idle', 'player', ['idle_0', 'idle_1'], 2);
    anim('eunho_idle', 'eunho', ['idle_0', 'idle_1'], 2);
    for (const k of Object.keys(assetList)) { // 생성 캐릭터(idle_0/1): `<id>_idle` 애니메이션
      const m = k.match(/^(.+)_idle_1$/);
      if (m && !this.anims.exists(`${m[1]}_idle`)) anim(`${m[1]}_idle`, m[1], ['idle_0', 'idle_1'], 2);
    }
    // 걷기: asset-spec 의 walk(공통 순서·fps)와 sequences[].walkCycle(인물별 순서)로 만든다. 걷기 그림이 없는 인물은 만들지 않고 idle 로 이동한다.
    for (const q of spec.sequences as { id: string; walkCycle?: string[]; walkFps?: number }[]) {
      const cycle = (q.walkCycle ?? spec.walk.cycle).map((f) => `${q.id}_${f}`);
      if (cycle.filter((k) => k.includes('_walk_') && this.textures.exists(k)).length >= 2 && cycle.every((k) => this.textures.exists(k))) this.anims.create({ key: `${q.id}_walk`, frameRate: q.walkFps ?? spec.walk.fps, repeat: -1, frames: cycle.map((key) => ({ key })) });
    }
    // 조사 지점 반짝임: 5×5 놋쇠색 2프레임 (0.8초 주기). 그림 파일 없이 코드로 만든다.
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x3a2a10); g.fillRect(1, 1, 1, 1); g.fillRect(3, 1, 1, 1); g.fillRect(1, 3, 1, 1); g.fillRect(3, 3, 1, 1); // 안쪽 모서리의 어두운 점: 밝은 옷·벽 위에서도 보이게
    g.fillStyle(0xe2c98a); g.fillRect(2, 0, 1, 5); g.fillRect(0, 2, 5, 1); g.fillStyle(0xfff3c4); g.fillRect(2, 2, 1, 1); g.generateTexture('sparkle_0', 5, 5); g.clear();
    g.fillStyle(0xb08a3c); g.fillRect(1, 1, 3, 3); g.fillStyle(0xe2c98a); g.fillRect(2, 2, 1, 1); g.generateTexture('sparkle_1', 5, 5); g.destroy();
    this.anims.create({ key: 'sparkle', frameRate: 2.5, repeat: -1, frames: [{ key: 'sparkle_0' }, { key: 'sparkle_1' }] });
    setTabHandler(() => { if (this.started && !this.locked && !this.busy && !isModalOpen()) openNotebook(this.state, () => {}); });
    setThenHandler((t) => { if (t === 'report') this.startReport(); });
    this.buildArea(START.area, START.x);
    if (!this.started) bgmBase(sceneTrack('title')); // 타이틀이 먼저 열려 있으면 타이틀 음악
  }

  // ---------- 구역 구성 ----------
  buildArea(id: string, spawnX: number) {
    const flip = this.player?.flipX ?? flipFor('player', false); // 처음엔 오른쪽을 본다
    this.children.removeAll(true);
    this.camPan = null;
    this.areaId = id;
    this.npcSprites.clear();
    this.state.currentSceneId = id;
    this.state.playerX = spawnX;
    if (!this.state.visitedAreaIds.includes(id)) this.state.visitedAreaIds.push(id);
    if (this.started) bgmBase(areaTrack(id)); // 타이틀·이름 입력 중에는 타이틀 음악을 유지한다 (새 게임·퀵 시작은 각자 지정)
    const a = areas[id], g = GROUND_Y, w = a.maxX - a.minX;
    const walk = a.walk ?? { min: a.minX, max: a.maxX }, cm = a.walk ? CAMERA_MARGIN : 0;
    this.minX = walk.min; this.maxX = walk.max; this.camMin = a.minX - cm; this.camMax = a.maxX + cm;

    // 배경: 지도 데이터(bg)가 지정한 텍스처가 모두 있으면 그림, 없으면 테마 색 사각형 (이전계획 3.3)
    const has = (k?: string): k is string => !!k && this.textures.exists(k);
    if (a.bg && has(a.bg.wall) && has(a.bg.floor)) {
      const tex = (k: string) => this.textures.get(k).getSourceImage() as HTMLImageElement;
      const tile = (k: string, y: number, depth: number) => this.add.tileSprite(a.minX, y, w, tex(k).height, k).setOrigin(0, 0).setDepth(depth);
      tile(a.bg.wall, g - tex(a.bg.wall).height + (a.bg.wallOffsetY ?? 0), 0); tile(a.bg.floor, g, 1);
      if (has(a.bg.topband)) tile(a.bg.topband, g - tex(a.bg.topband).height, 2);
    } else {
      const t = themes[a.theme] ?? themes.admin;
      this.add.rectangle(a.minX, g - 270, w, 270, Phaser.Display.Color.HexStringToColor(t.wall).color).setOrigin(0, 0).setDepth(0);
      this.add.rectangle(a.minX, g, w, 270 - g, Phaser.Display.Color.HexStringToColor(t.floor).color).setOrigin(0, 0).setDepth(1);
      this.add.rectangle(a.minX, g, w, 2, 0x000000, 0.35).setOrigin(0, 0).setDepth(2);
    }
    if (a.walk) { // 갈 수 없는 곳은 검은색: 구역 가장자리 안쪽을 3단계로 어둡게 이어 붙인다 (픽셀 그라데이션)
      for (const [i, al] of [0.3, 0.55, 0.8].entries()) {
        this.add.rectangle(a.minX + i * 8, 0, 8, 270, 0x000000, al).setOrigin(0, 0).setDepth(2.5);
        this.add.rectangle(a.maxX - (i + 1) * 8, 0, 8, 270, 0x000000, al).setOrigin(0, 0).setDepth(2.5);
      }
    }
    for (const o of a.objects ?? []) if (has(o.tex)) this.add.image(o.x, g - o.bottom, o.tex).setOrigin(0.5, 1).setDepth(o.tex === 'door' ? 4 : 3);

    for (const pr of a.props ?? []) {
      if (pr.showWhen && !hasFlag(this.state, pr.showWhen)) continue; // 예: 백선우가 떠난 뒤 놓이는 청소 카트 (아트 전까지 placeholder)
      if (has(pr.tex)) { this.add.image(pr.x, g, pr.tex).setOrigin(0.5, 1).setDepth(4); continue; }
      this.add.rectangle(pr.x, g, pr.w, pr.h, Phaser.Display.Color.HexStringToColor(pr.color).color).setOrigin(0.5, 1).setDepth(4).setStrokeStyle(1, 0x000000, 0.6);
    }
    for (const it of a.interactables) if (!isHidden(it, this.state)) this.drawInteractable(a, it);

    if (this.started) saveGame(this.state);
    this.player = this.add.sprite(spawnX, g, 'player_idle_0').setOrigin(0.5, 1).setFlipX(flip).setDepth(6).play('player_idle');
    const cam = this.cameras.main;
    cam.setBounds(this.camMin, 0, this.camMax - this.camMin, 270);
    cam.startFollow(this.player, true);
    cam.centerOn(this.player.x, 135);
  }

  private drawInteractable(a: (typeof areas)[string], it: Interactable) {
    this.drawInteractableArt(a, it);
    if (showsSparkle(it, this.state)) { // 아직 조사하지 않은 지점 위에 반짝임 (캐릭터보다 위 레이어)
      const g = GROUND_Y, art = it.type === 'examine' && it.art && this.textures.exists(it.art) ? (this.textures.get(it.art).getSourceImage() as HTMLImageElement).height + (it.artBottom ?? 0) : 22;
      this.add.sprite(it.x, g - art - 5, 'sparkle_0').setOrigin(0.5, 1).setDepth(7).play('sparkle');
    }
  }

  private drawInteractableArt(a: (typeof areas)[string], it: Interactable) {
    const g = GROUND_Y;
    if (it.type === 'transition') {
      const art = !isAvailable(it, this.state) && it.artLocked && this.textures.exists(it.artLocked) ? it.artLocked : it.art; // 잠겨 있을 때는 닫힌 그림(artLocked), 열린 뒤에는 art
      if (art && this.textures.exists(art)) { // 아트가 있는 문·계단은 그림으로, 없으면 아래 placeholder
        if (!(a.objects ?? []).some((o) => o.tex === art)) this.add.image(it.x, g, art).setOrigin(0.5, 1).setDepth(it.kind === 'door' ? 4 : 3);
        return;
      }
      const stairs = it.kind === 'stairs';
      this.add.rectangle(it.x, g, stairs ? 56 : 40, stairs ? 96 : 104, stairs ? 0x8a9096 : 0x2a2622).setOrigin(0.5, 1).setDepth(3).setStrokeStyle(1, 0x000000, 0.6);
      if (stairs) for (let i = 1; i < 5; i++) this.add.rectangle(it.x, g - i * 18, 56, 1, 0x000000, 0.35).setOrigin(0.5, 1).setDepth(4);
    } else if (it.type === 'npc') {
      const sprite = a.npcSprite?.[it.id];
      if (sprite && this.textures.exists(`${sprite}_idle_0`)) this.npcSprites.set(it.id, this.add.sprite(it.x, g, `${sprite}_idle_0`).setOrigin(0.5, 1).setFlipX(flipFor(sprite, a.npcFacing?.[it.id] === 'left')).setDepth(5).play(`${sprite}_idle`));
      else { // 회색 실루엣 placeholder (몸 + 머리)
        this.add.rectangle(it.x, g, 30, 66, 0x8a8f94).setOrigin(0.5, 1).setDepth(5);
        this.add.rectangle(it.x, g - 66, 22, 24, 0x8a8f94).setOrigin(0.5, 1).setDepth(5);
      }
    } else if (it.art && this.textures.exists(it.art)) { // 조사 지점 그림이 있으면 노란 마름모 대신 그림 (그림 자체가 조사 대상)
      this.add.image(it.x, g - (it.artBottom ?? 0), it.art).setOrigin(0.5, 1).setDepth(3); // artBottom: 벽에 거는 그림은 바닥선 위로 띄운다
    } else if (!it.closeup && isAvailable(it, this.state)) {
      this.add.rectangle(it.x, g - 14, 12, 12, 0xe8d36a).setAngle(45).setDepth(5).setStrokeStyle(1, 0x000000, 0.6); // 조사 지점
    }
  }

  // ---------- 매 프레임 ----------
  update(_t: number, dt: number) {
    this.lastDt = dt;
    if (this.camPan) { // 컷신용 느린 카메라 이동 (프레임 시간에 맞춘 지수 보간)
      const cam = this.cameras.main, want = Phaser.Math.Clamp(this.camPan.obj.x - cam.width / 2, this.camMin, this.camMax - cam.width);
      const k = 1 - Math.pow(1 - this.camPan.smooth, dt / 16.7);
      cam.scrollX += (want - cam.scrollX) * (this.skip ? 1 : k);
    }
    this.heldMs = this.locked && !isModalOpen() && isEnterHeld() ? this.heldMs + dt : 0; // 연출 건너뛰기: Enter 길게 누르기
    this.skip = this.heldMs >= SKIP_HOLD_MS;
    if (this.locked) { if (!isModalOpen() && !this.scripted.has(this.player) && this.player.anims.currentAnim?.key !== 'player_idle') this.player.play('player_idle'); return; } // 연출이 걷게 하는 동안(scripted)은 그림을 건드리지 않는다
    if (this.busy || isModalOpen()) { this.player.anims.currentAnim?.key !== 'player_idle' && this.player.play('player_idle'); return; }
    const dir = (isHeld('ArrowRight') || isHeld('d') ? 1 : 0) - (isHeld('ArrowLeft') || isHeld('a') ? 1 : 0);
    const speed = PLAYER_SPEED * (isHeld('Shift') ? RUN_MULTIPLIER : 1);
    const p = this.player;
    p.x = Phaser.Math.Clamp(p.x + dir * speed * (dt / 1000), this.minX, this.maxX);
    if (dir !== 0) { p.setFlipX(flipFor('player', dir < 0)); this.stepMs += dt; if (this.stepMs >= (isHeld('Shift') ? 230 : 340)) { this.stepMs = 0; sfx('onFootstep'); } } else this.stepMs = 0;
    const want = dir !== 0 ? 'player_walk' : 'player_idle';
    if (p.anims.currentAnim?.key !== want) p.play(want);

    const area = areas[this.areaId];
    const auto = autoTriggered(this.areaId, area, p.x, this.state);
    if (auto) { setFlag(this.state, triggerKey(this.areaId, auto.id)); this.talk(auto); return; }

    const it = nearest(area, p.x, this.state);
    setPrompt(it ? promptOf(it) : null);
    const pressed = consumePress('Enter'); // 대상이 없을 때 눌린 Enter 가 쌓였다가 나중에 계단 앞에서 터지지 않도록 매 프레임 비운다
    if (it && pressed) this.interact(it);
    else if (it && it.type === 'transition' && it.auto) this.interact(it); // 자동 전환은 map.json 에 auto: true 로 명시한 경우만
  }

  // ---------- 상호작용 ----------
  private interact(it: Interactable) {
    if (!isAvailable(it, this.state)) {
      if (it.type === 'transition' && it.lockedDialogue) { setPrompt(null); if (it.lockedSfx) sfx(it.lockedSfx); openDialogue(this.state, it.lockedDialogue); } // 잠긴 이유 한 줄 독백 (지하 철창문은 쇠 소리도)
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
    if (it.sfx) sfx(it.sfx); // 철창문 등 전용 소리
    transitionSfx(it.kind, this.areaId, it.to);
    if (!it.cutscene || hasFlag(this.state, flag)) { void this.go(it.to, it.spawnX); return; }
    setFlag(this.state, flag); sfx('onFadeWhoosh');
    this.busy = true; setPrompt(null);
    void fadeThrough(0.3, 0.3, () => openCutscene(it.cutscene!, () => { this.busy = false; void this.go(it.to, it.spawnX); }, it.cutsceneDialogue ? { state: this.state, dialogueId: it.cutsceneDialogue } : undefined));
  }

  /** 조사 지점: 독백(dialogueId)이 있으면 독백 → 원문 보기, 없으면 바로 원문 보기. 이미 얻었으면 원문만 다시 연다. */
  private examine(it: Examine) {
    setPrompt(null);
    const ids = [...(it.evidenceId ? [it.evidenceId] : []), ...(it.evidenceIds ?? [])];
    const have = ids.length > 0 && ids.every((id) => this.state.evidenceIds.includes(id));
    if (it.dialogueId && !have) { openDialogue(this.state, it.dialogueId, (got) => this.showDocs(got)); return; }
    const fresh = ids.filter((id) => acquireEvidence(this.state, id));
    for (const id of fresh) showToast(`단서 획득: ${shownEvidence(this.state, id)!.title}`);
    if (fresh.length) sfx('onEvidenceGet');
    this.showDocs(have ? ids : fresh);
  }

  /** 얻은 자료의 원문을 차례로 보여 준 뒤 화면을 갱신하고, 조건이 갖춰진 퍼즐을 자동으로 연다 */
  private showDocs(ids: string[], then?: () => void) {
    const next = ids.slice();
    const step = () => {
      const id = next.shift();
      if (id) { openViewer(this.state, id, () => { const f = evidenceById.get(id)?.afterView; if (f) setFlag(this.state, f); step(); }); return; }
      if (then) { then(); return; } // 연출 중에는 구역을 다시 그리지 않고 이어서 진행한다
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
    openDialogue(this.state, 'mono_basement_open'); // 철창문이 열리는 순간의 gate_clank 는 audio.json nodeEvents(mono_basement_open:m)
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
  /** 새 게임: 이름 입력 → 책상 근접 조사 → 오프닝 연출. quick 이면 오프닝 없이 바로 시작한다 (시험용 훅에서만 사용). */
  newGame(quick = false) {
    this.state = createGameState(); setPlayerName(this.state.playerName);
    this.started = false; this.locked = false;
    this.buildArea(START.area, START.x);
    if (quick) { this.started = true; bgmBase(areaTrack(START.area)); return; }
    bgmBase(sceneTrack('title')); // 이름 입력·책상 조사까지는 타이틀 음악, 오프닝이 시작되면 사무실 음악
    openNamePopup((name) => {
      this.state.playerName = name; setPlayerName(name);
      setPrompt(null);
      openCloseup(this.state, OPENING.closeup, () => { void this.runOpening(); });
    });
  }
  continueGame(st: GameState) { this.state = st; setPlayerName(st.playerName); this.started = true; this.buildArea(st.currentSceneId, st.playerX); }

  /** 씬 7: 시작 시점을 저장해 두고(엔딩 D 재도전용) 최종 보고서를 연다 */
  startReport() {
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
    bgmBase(sceneTrack('title'));
    openTitle({ canContinue: loadGame() !== null, onNew: () => this.newGame(), onContinue: () => { const st = loadGame(); if (st) this.continueGame(st); else this.newGame(); } });
  }

  // ---------- 오프닝 연출 (map.json opening.steps 를 순서대로 실행) ----------
  private frame() { return new Promise<void>((r) => this.events.once('update', () => r())); }
  private async until(cond: () => boolean) { while (!cond() && !this.skip) await this.frame(); }
  private async sleep(sec: number) { let t = 0; while (t < sec * 1000 && !this.skip) { t += this.lastDt; await this.frame(); } }
  /** 연출 대상: 'player' · 'npc:<id>'(이 구역에 그려진 NPC) · 오프닝 배우 이름 */
  private actorOf(name: string) { return name === 'player' ? this.player : name.startsWith('npc:') ? this.npcSprites.get(name.slice(4))! : this.actors.get(name)!; }
  /** 그 대상 그림의 스프라이트 키 (walkFlip·애니메이션 이름에 쓴다) */
  private keyOf(name: string) { return name === 'player' ? 'player' : name.startsWith('npc:') ? areas[this.areaId].npcSprite![name.slice(4)] : OPENING.actors[name].sprite; }
  private playDialogue(id: string, docs: boolean) {
    return new Promise<void>((r) => openDialogue(this.state, id, (got) => {
      if (docs) this.showDocs(got.filter((x) => shownEvidence(this.state, x)?.body), () => r()); else r();
    }));
  }

  async runOpening() {
    this.locked = true; clearInput(); this.camPan = null;
    bgmBase(areaTrack(START.area));
    const g = GROUND_Y;
    for (const [name, d] of Object.entries(OPENING.actors)) { // 등장 전에는 사무실에 없다
      const sp = this.add.sprite(d.x, g, `${d.sprite}_idle_0`).setOrigin(0.5, 1).setDepth(5).setVisible(false).play(`${d.sprite}_idle`);
      sp.setFlipX(flipFor(d.sprite, d.facing === 'left'));
      this.actors.set(name, sp);
    }
    await this.runSteps(OPENING.steps);
  }

  /** 구역에 처음 들어왔을 때의 연출 (map.json 의 areas.<구역>.stage). 이미 본 뒤(flag)와 F9 씬 점프(buildArea 직접 호출)에는 재생하지 않는다. */
  private async maybeStage() {
    const st = areas[this.areaId].stage;
    if (!st || hasFlag(this.state, st.flag) || !this.started || this.locked) return;
    setFlag(this.state, st.flag);
    this.locked = true; clearInput(); setPrompt(null);
    await this.runSteps(st.steps);
  }

  /** 연출 단계 실행 (오프닝·구역 연출 공통). 단계 데이터는 map.json. */
  private async runSteps(steps: OpeningStep[]) {
    const cam = this.cameras.main;
    // 카메라: smooth < 1 이면 직접 천천히 따라가고(컷신), 1 이면 평소처럼 즉시 추적
    const follow = (to: string, smooth: number) => {
      const obj = to === 'player' ? this.player : this.actorOf(to.startsWith('actor:') ? to.slice(6) : to);
      if (smooth >= 1) { this.camPan = null; cam.startFollow(obj, true); } else { cam.stopFollow(); this.camPan = { obj, smooth }; }
    };
    for (const s of steps) {
      switch (s.do) {
        case 'dialogue': await this.playDialogue(s.id!, !!s.docs); clearInput(); break;
        case 'camera':
          follow(s.to!, s.smooth ?? 1);
          if (s.settle) { let still = 0, last = cam.scrollX; await this.until(() => { still = Math.abs(cam.scrollX - last) < 0.05 ? still + 1 : 0; last = cam.scrollX; return still >= 8; }); }
          break;
        case 'appear': this.actorOf(s.actor!).setVisible(true); break;
        case 'hide': this.actorOf(s.actor!).setVisible(false); break;
        case 'face': { const sp = this.actorOf(s.actor!); sp.setFlipX(flipFor(this.keyOf(s.actor!), s.dir === 'left')); break; }
        case 'wait': await this.sleep(s.sec ?? 0); break;
        case 'walk': {
          const sp = this.actorOf(s.actor!), key = this.keyOf(s.actor!), walkAnim = this.anims.exists(`${key}_walk`) ? `${key}_walk` : `${key}_idle`; // 걷는 그림이 없는 인물은 서 있는 그림 그대로 미끄러진다
          const toX = s.toX ?? this.player.x + (s.gap ?? 56);
          sp.setFlipX(walkFlip(key, sp.x, toX)).play(walkAnim, true); this.scripted.add(sp);
          while (Math.abs(sp.x - toX) > 0.5 && !this.skip) { sp.x += Math.sign(toX - sp.x) * Math.min(Math.abs(toX - sp.x), (s.speed ?? 135) * (this.lastDt / 1000)); await this.frame(); }
          sp.x = toX; this.scripted.delete(sp); sp.play(`${key}_idle`, true);
          if (s.actor === 'eunho' && s.toX === undefined) sp.setFlipX(flipFor(key, true)); // 도착하면 플레이어(왼쪽)를 본다
          break;
        }
        case 'refresh': this.buildArea(this.areaId, this.player.x); break; // NPC 퇴장·소품 등장을 반영해 구역을 다시 그린다
        case 'unlock': follow('player', 1); this.camPan = null; this.locked = false; this.started = true; clearInput(); saveGame(this.state); break;
        case 'hints': queueHints(s.texts ?? [], s.sec ?? 4); break;
      }
    }
  }

  /** 같은 자리에서 구역을 다시 그린다 (NPC 퇴장, 소품 등장 반영) */
  refresh() { if (!this.busy) this.buildArea(this.areaId, this.player.x); }

  /** 구역 전환 + 페이드. 이미 방문한 구역은 0.4초 이하. */
  go(to: string, spawnX: number): Promise<void> {
    if (this.busy) return Promise.resolve();
    this.busy = true;
    setPrompt(null);
    const f = fadeSeconds(this.state.visitedAreaIds.includes(to));
    return fadeThrough(f.out, f.in, () => this.buildArea(to, spawnX)).then(() => { this.busy = false; void this.maybeStage(); });
  }

  playerFacesLeft() { return facesLeft('player', this.player.flipX); }
  teleportX(x: number) { this.player.x = Phaser.Math.Clamp(x, this.minX, this.maxX); } // e2e 전용 훅에서만 사용
  hasFlag(f: string) { return hasFlag(this.state, f); }
}
