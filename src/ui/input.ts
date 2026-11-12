import { sfx, toggleMute } from '../audio/audio';
import { showToast } from './hud';
// 키보드 입력 + 모달 스택. 모달이 열려 있으면 키는 맨 위 모달만 받는다. 모든 화면은 키보드만으로 조작 가능해야 한다.
const held = new Set<string>();
const queue: string[] = [];
interface Modal { id: string; onKey: (e: KeyboardEvent) => void; raw?: boolean } // raw: 글자 입력창 — 스페이스·방향키·Enter 의 기본 동작을 막지 않는다
const modals: Modal[] = [];

const norm = (k: string) => (k.length === 1 ? k.toLowerCase() : k);
export const isHeld = (k: string) => held.has(k);
export const isModalOpen = () => modals.length > 0;
export const topModalId = () => modals[modals.length - 1]?.id ?? null;
/** 눌러 둔 키 상태를 모두 비운다 (장면 연출 뒤 잠금을 풀 때) */
export const clearInput = () => { held.clear(); queue.length = 0; };
export const isEnterHeld = () => held.has('Enter');
export const consumePress = (k: string) => { const i = queue.indexOf(k); if (i < 0) return false; queue.length = 0; return true; };

export function pushModal(m: Modal) { held.clear(); queue.length = 0; modals.push(m); }
export function popModal(id: string) {
  const i = modals.findIndex((m) => m.id === id);
  if (i >= 0) modals.splice(i, 1);
  held.clear(); queue.length = 0;
}

/** 탐색 중에 Tab 을 눌렀을 때 호출 (수첩 열기) */
let onTab: () => void = () => {};
export const setTabHandler = (f: () => void) => { onTab = f; };
/** 탐색 중에 L 을 눌렀을 때 호출 (대사 기록 열기) */
let onLog: () => void = () => {};
export const setLogHandler = (f: () => void) => { onLog = f; };

window.addEventListener('keydown', (e) => {
  const top = modals[modals.length - 1];
  if ((e.key === 'm' || e.key === 'M') && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey && !top?.raw) { showToast(toggleMute() ? '소리 끔 (M)' : '소리 켬 (M)', 1200); return; } // 전체 음소거
  if (top) {
    if (!e.repeat && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && !top.raw) sfx('onUiMove');
    if (top.raw ? e.key === 'Tab' : ['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter', 'Escape'].includes(e.key)) e.preventDefault();
    top.onKey(e);
    return;
  }
  if (e.key === 'Tab') { e.preventDefault(); if (!e.repeat) onTab(); return; }
  if ((e.key === 'l' || e.key === 'L') && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey) { onLog(); return; }
  if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault();
  held.add(norm(e.key));
  if (e.key === 'Enter' && !e.repeat) { e.preventDefault(); queue.push('Enter'); }
});
window.addEventListener('keyup', (e) => held.delete(norm(e.key)));
window.addEventListener('blur', () => held.clear());
