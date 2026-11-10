import Phaser from 'phaser';
import './ui/ui.css';
import { acquireEvidence, claims, createGameState, enterNode, getNode, puzzles, saveConclusion, setFlag, submitPuzzle } from './core';
import { dialogues, isTestBuild } from './explore/content';
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
scene.openTitle(); // 타이틀: 새 게임 / 이어하기 / 조작법

// 테스트·스크린샷용 훅 (e2e 빌드에서만 노출)
(window as unknown as { __game: Phaser.Game }).__game = game;
if (isTestBuild) {
  /** 씬 5 직전 상태로 건너뛴다: 씬 1~4 의 단서·퍼즐·진술·플래그를 모두 얻은 상태 (분기 시험용) */
  const ff = (scene5Done = false) => {
    const s = scene.state;
    for (const id of ['E01_last_letter', 'E02_altar_blood', 'E03_preliminary_exam', 'E04_wristband_fragment', 'E05_access_log', 'E06_torn_sleeve', 'E07_report_revision', 'E08_miran_revised', 'E09_sedative_gap', 'E10_consent_forms', 'E11_transfer_order']) acquireEvidence(s, id);
    for (const p of puzzles.filter((q) => ['P01', 'P02', 'P03', 'P04'].some((k) => q.id.startsWith(k)))) submitPuzzle(s, p.id, p.correctSlots);
    for (const [d, n] of [['han_yujin', 'y3'], ['han_yujin', 'y1'], ['baek_lobby', 'b1'], ['choi_okja', 'c1'], ['jeong_haneul', 'h1']] as const) enterNode(s, getNode(dialogues, d, n));
    for (const f of ['intro_done', 'baek_left', 'office_access_granted', 'choi_done', 'han_done', 'chae_done', 'broadcast_seen', 'haneul_met', 'basement_announced', 'cutscene_done:hospital_intro']) setFlag(s, f);
    for (const a of ['office', 'floor1', 'room_director', 'floor2', 'floor3', 'room_baek', 'room_oh', 'room_lee']) if (!s.visitedAreaIds.includes(a)) s.visitedAreaIds.push(a);
    if (scene5Done) { // 씬 5 까지 끝낸 상태: 지하 단서·P05 해결·정하늘 고백 → 씬 6 이 바로 시작된다
      for (const id of ['E12_ledger', 'E13_identity_map', 'E14_belongings_diary', 'E15_transport_manifest']) acquireEvidence(s, id);
      submitPuzzle(s, 'P05_patient_code', puzzles.find((q) => q.id === 'P05_patient_code')!.correctSlots);
      for (const f of ['diary_closed', 'haneul_confessed']) setFlag(s, f);
    }
    scene.state.currentSceneId = 'floor1';
    void scene.go('b1', 0);
  };
  (window as unknown as Record<string, unknown>).__cw = {
    get state() { return scene.state; }, scene, ff, saveConclusion, claims,
    openDialogue: (id: string) => openDialogue(scene.state, id),
  };
}
