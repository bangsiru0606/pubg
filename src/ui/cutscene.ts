// 컷신: 일러스트 한 장. Enter / Esc / 클릭으로 건너뛴다 (보정판 6.0: 컷신은 건너뛸 수 있다).
import { el, root } from './hud';
import { popModal, pushModal } from './input';

export function openCutscene(image: string, onClose: () => void) {
  const box = el('div', 'modal cutscene', `<img src="assets/illust/${image}.webp" alt=""><div class="foot">Enter / Esc / 클릭: 건너뛰기</div>`);
  box.id = 'cutscene';
  root().append(box);
  const close = () => { popModal('cutscene'); box.remove(); onClose(); };
  box.addEventListener('click', close);
  pushModal({ id: 'cutscene', onKey(e) { if ((e.key === 'Enter' || e.key === 'Escape') && !e.repeat) close(); } });
}
