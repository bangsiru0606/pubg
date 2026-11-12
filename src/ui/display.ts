// 화면 배율과 전체화면. 기본은 정수 배율(픽셀이 고르게 확대된다), 설정의 "화면 채우기"를 켜면 창에 꽉 차게 소수 배율로 확대한다(픽셀은 최근접 보간 그대로).
const KEY = 'confession-ward-display';
let fill = false;
try { fill = !!JSON.parse(localStorage.getItem(KEY) ?? 'null')?.fill; } catch { /* 저장소 사용 불가: 기본값(정수 배율) */ }

let refit: () => void = () => {};
export const getFill = () => fill;
export function setFill(v: boolean) {
  fill = v; refit();
  try { localStorage.setItem(KEY, JSON.stringify({ fill })); } catch { /* 무시 */ }
}
export const isFullscreen = () => !!document.fullscreenElement;
/** 전체화면 켜기/끄기 (사용자 입력 안에서 호출해야 한다). 지원하지 않거나 거부되면 false */
export async function toggleFullscreen(): Promise<boolean> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen();
    return true;
  } catch { return false; }
}

/** 배율 k: 정수 배율은 가능한 가장 큰 정수(최소 1), 채우기는 창에 맞는 실수 */
export const scaleFor = (w: number, h: number, W: number, H: number, fillMode: boolean) => {
  const s = Math.min(w / W, h / H);
  return fillMode ? s : Math.max(1, Math.floor(s));
};

export function initDisplay(W: number, H: number, els: { stage: HTMLElement; canvas: HTMLElement; ui: HTMLElement }) {
  refit = () => {
    const k = scaleFor(window.innerWidth, window.innerHeight, W, H, fill);
    els.stage.style.width = `${W * k}px`; els.stage.style.height = `${H * k}px`;
    els.canvas.style.width = `${W * k}px`; els.canvas.style.height = `${H * k}px`;
    els.ui.style.transform = `scale(${k})`;
  };
  window.addEventListener('resize', refit);
  document.addEventListener('fullscreenchange', refit);
  refit();
}
