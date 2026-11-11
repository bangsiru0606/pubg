// 컷신: 일러스트 한 장. Enter / Esc / 클릭으로 건너뛴다 (보정판 6.0: 컷신은 건너뛸 수 있다).
// 독백 대사(dialogueId)가 있으면 그림 위에 대화창으로 보여 주고, 대사가 끝나면 컷신이 닫힌다 (대화 중에는 Enter 로 한 줄씩).
import type { GameState } from '../core';
import { el, root } from './hud';
import { popModal, pushModal } from './input';
import { openDialogue } from './dialogue';

export function openCutscene(image: string, onClose: () => void, narration?: { state: GameState; dialogueId: string }) {
  const box = el('div', 'modal cutscene', `<img src="assets/illust/${image}.webp" alt="">${narration ? '' : '<div class="foot">Enter / Esc / 클릭: 건너뛰기</div>'}`);
  box.id = 'cutscene';
  root().append(box);
  const close = () => { popModal('cutscene'); box.remove(); onClose(); };
  if (narration) { openDialogue(narration.state, narration.dialogueId, close); return; } // 맨 위 모달이 대화창이라 컷신 자신은 키를 받지 않는다
  box.addEventListener('click', close);
  pushModal({ id: 'cutscene', onKey(e) { if ((e.key === 'Enter' || e.key === 'Escape') && !e.repeat) close(); } });
}
