// 새 게임 이름 입력 (craft_on NamePopupController 와 같은 흐름): 비워 두고 Enter 를 누르면 기본 이름.
// 1~8자, 앞뒤 공백 제거. 한글 입력(IME) 조합 중에 누른 Enter 는 확정이 아니다. 입력 중에는 게임 키가 동작하지 않는다(모달).
import { DEFAULT_PLAYER_NAME, NAME_MAX, normalizeName } from '../core';
import { el, esc, root } from './hud';
import { popModal, pushModal } from './input';

export function openNamePopup(onDone: (name: string) => void) {
  const box = el('div', 'modal namepop'); box.id = 'namepopup';
  box.innerHTML = `<div class="np"><div class="nl">사용자의 이름을 입력해주세요.</div>
    <input id="nameinput" type="text" maxlength="${NAME_MAX}" placeholder="ex. ${esc(DEFAULT_PLAYER_NAME)}" autocomplete="off" spellcheck="false">
    <div class="nh">${NAME_MAX}자까지 · 비워 두고 Enter 를 누르면 “${esc(DEFAULT_PLAYER_NAME)}”</div></div>`;
  root().append(box);
  const input = box.querySelector('input')!;
  let done = false;
  const confirm = () => { if (done) return; done = true; const n = normalizeName(input.value); popModal('namepopup'); box.remove(); onDone(n); };
  // IME 조합 중(isComposing / keyCode 229)의 Enter 는 글자 확정용이므로 무시한다
  const composing = (e: KeyboardEvent) => e.isComposing || e.keyCode === 229;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !composing(e)) { e.preventDefault(); confirm(); } });
  pushModal({ id: 'namepopup', raw: true, onKey(e) { if (e.key === 'Enter' && !composing(e) && document.activeElement !== input) confirm(); } }); // 입력창이 처리하고, 포커스가 없을 때의 Enter 도 확정한다
  // 입력창 밖을 눌러 포커스를 잃어도 곧바로 되돌린다 (키보드만으로 계속 진행할 수 있게)
  input.addEventListener('blur', () => { if (!done) setTimeout(() => input.focus(), 0); });
  input.focus(); // 열리자마자 바로 입력할 수 있게 즉시 포커스 (아래 지연 포커스는 애니메이션·레이아웃 직후의 보험)
  setTimeout(() => input.focus(), 0);
}
