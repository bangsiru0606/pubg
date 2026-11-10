// HUD: 상호작용 프롬프트, 토스트, 전환 페이드. #ui 컨테이너 안에 만든다.
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

let uiRoot: HTMLElement;
let prompt: HTMLElement, toast: HTMLElement, fade: HTMLElement;
let toastTimer = 0;

export const root = () => uiRoot;

export function initHud(ui: HTMLElement) {
  uiRoot = ui;
  prompt = el('div', 'prompt hidden'); prompt.id = 'prompt';
  toast = el('div', 'toast hidden'); toast.id = 'toast'; toast.setAttribute('role', 'status');
  fade = el('div', 'fade'); fade.id = 'fade';
  const hint = el('div', 'hint', '←→ 이동 · Shift 달리기 · Enter 상호작용 · Tab 사건 수첩');
  ui.append(hint, prompt, toast, fade);
}

export function setPrompt(p: { label: string; action: string } | null) {
  if (!p) { prompt.classList.add('hidden'); prompt.dataset.key = ''; return; }
  const key = p.label + p.action;
  if (prompt.dataset.key === key) return;
  prompt.dataset.key = key;
  prompt.innerHTML = `<div class="lbl">${esc(p.label)}</div><div><kbd>Enter</kbd>${esc(p.action)}</div>`;
  prompt.classList.remove('hidden');
}

export function showToast(msg: string, ms = 2500) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.add('hidden'), ms);
}

/** 페이드 아웃 → fn → 페이드 인. 합계가 곧 전환 시간. */
export function fadeThrough(outSec: number, inSec: number, fn: () => void): Promise<void> {
  return new Promise((resolve) => {
    fade.style.transitionDuration = `${outSec}s`;
    fade.style.opacity = '1';
    window.setTimeout(() => {
      fn();
      fade.style.transitionDuration = `${inSec}s`;
      fade.style.opacity = '0';
      window.setTimeout(resolve, inSec * 1000);
    }, outSec * 1000);
  });
}
