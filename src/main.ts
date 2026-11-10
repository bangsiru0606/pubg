import Phaser from 'phaser';
import './ui/ui.css';
import { createGameState } from './core';
import { isTestBuild } from './explore/content';
import { ExploreScene } from './scenes/ExploreScene';
import { openDialogue } from './ui/dialogue';
import { initHud } from './ui/hud';

export const W = 480;
export const H = 270;

const stage = document.getElementById('stage')!;
const ui = document.getElementById('ui')!;
initHud(ui);

const scene = new ExploreScene();
scene.state = createGameState();

const game = new Phaser.Game({
  type: Phaser.CANVAS,
  parent: stage,
  width: W,
  height: H,
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.NONE },
  loader: { imageLoadType: 'HTMLImageElement' }, // file:// 에서 XHR 없이 이미지 로드
  scene,
});
stage.append(ui); // 캔버스 위에 UI 오버레이

// 정수 배율로만 확대, 남는 영역은 레터박스(검정). UI 오버레이도 같은 배율.
function fit() {
  const k = Math.max(1, Math.floor(Math.min(window.innerWidth / W, window.innerHeight / H)));
  stage.style.width = `${W * k}px`;
  stage.style.height = `${H * k}px`;
  game.canvas.style.width = `${W * k}px`;
  game.canvas.style.height = `${H * k}px`;
  ui.style.transform = `scale(${k})`;
}
window.addEventListener('resize', fit);
fit();

// 테스트·스크린샷용 훅 (e2e 빌드에서만 노출)
(window as unknown as { __game: Phaser.Game }).__game = game;
if (isTestBuild) (window as unknown as Record<string, unknown>).__cw = { state: scene.state, scene, openDialogue: (id: string) => openDialogue(scene.state, id) };
