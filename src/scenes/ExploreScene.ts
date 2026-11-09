import Phaser from 'phaser';
import map from '../data/map.json';

const O = map.office;
const A = 'assets/';
const PLAYER_FRAMES = ['idle_0', 'idle_1', 'walk_0', 'walk_1', 'walk_2', 'walk_3'];
const EUNHO_FRAMES = ['idle_0', 'idle_1', 'walk_0', 'walk_1', 'walk_2', 'walk_3', 'walk_4', 'walk_5'];

export class ExploreScene extends Phaser.Scene {
  player!: Phaser.GameObjects.Sprite;
  private keys!: Record<'left' | 'right' | 'a' | 'd', Phaser.Input.Keyboard.Key>;

  constructor() { super('Explore'); }

  preload() {
    for (const id of ['wall', 'floor', 'floor_topband', ...O.objects.map((o) => o.tex)]) this.load.image(id, `${A}${id}.png`);
    for (const f of PLAYER_FRAMES) this.load.image(`player_${f}`, `${A}player_${f}.png`);
    for (const f of EUNHO_FRAMES) this.load.image(`eunho_${f}`, `${A}eunho_${f}.png`);
  }

  create() {
    const g = O.groundY;
    const w = O.maxX - O.minX;
    const tex = (k: string) => this.textures.get(k).getSourceImage() as HTMLImageElement;
    const tile = (k: string, y: number, depth: number) =>
      this.add.tileSprite(O.minX, y, w, tex(k).height, k).setOrigin(0, 0).setDepth(depth);
    tile('wall', g - tex('wall').height, 0);
    tile('floor', g, 1);
    tile('floor_topband', g - tex('floor_topband').height, 2);

    for (const o of O.objects) this.add.image(o.x, g - o.bottom, o.tex).setOrigin(0.5, 1).setDepth(o.tex === 'door' ? 4 : 3);

    const anim = (key: string, prefix: string, frames: string[], frameRate: number) =>
      this.anims.create({ key, frameRate, repeat: -1, frames: frames.map((f) => ({ key: `${prefix}_${f}` })) });
    anim('player_walk', 'player', ['walk_0', 'walk_1', 'walk_2', 'walk_3'], 8);
    anim('player_idle', 'player', ['idle_0', 'idle_1'], 2);
    anim('eunho_idle', 'eunho', ['idle_0', 'idle_1'], 2);

    // 박은호: 문 근처에 서 있음 (대화는 3단계 이후)
    for (const n of O.npcs) this.add.sprite(n.x, g, 'eunho_idle_0').setOrigin(0.5, 1).setFlipX(n.flipX).setDepth(5).play('eunho_idle');

    this.player = this.add.sprite(O.playerStartX, g, 'player_idle_0').setOrigin(0.5, 1).setDepth(6).play('player_idle');

    const cam = this.cameras.main;
    cam.setBounds(O.minX, 0, w, 270);
    cam.startFollow(this.player, true);

    const kb = this.input.keyboard!;
    this.keys = {
      left: kb.addKey('LEFT'), right: kb.addKey('RIGHT'), a: kb.addKey('A'), d: kb.addKey('D'),
    };
  }

  update(_t: number, dt: number) {
    const dir = (this.keys.right.isDown || this.keys.d.isDown ? 1 : 0) - (this.keys.left.isDown || this.keys.a.isDown ? 1 : 0);
    const p = this.player;
    p.x = Phaser.Math.Clamp(p.x + dir * O.playerSpeed * (dt / 1000), O.minX, O.maxX);
    if (dir !== 0) p.setFlipX(dir < 0);
    const want = dir !== 0 ? 'player_walk' : 'player_idle';
    if (p.anims.currentAnim?.key !== want) p.play(want);
  }
}
