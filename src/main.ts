import Phaser from 'phaser';
import { ExploreScene } from './scenes/ExploreScene';

export const W = 480;
export const H = 270;

const game = new Phaser.Game({
  type: Phaser.CANVAS,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.NONE },
  loader: { imageLoadType: 'HTMLImageElement' }, // file:// 에서 XHR 없이 이미지 로드
  scene: [ExploreScene],
});

// 정수 배율로만 확대, 남는 영역은 레터박스(검정)
function fit() {
  const k = Math.max(1, Math.floor(Math.min(window.innerWidth / W, window.innerHeight / H)));
  game.canvas.style.width = `${W * k}px`;
  game.canvas.style.height = `${H * k}px`;
}
window.addEventListener('resize', fit);
fit();
(window as unknown as { __game: Phaser.Game }).__game = game; // 테스트·스크린샷용
