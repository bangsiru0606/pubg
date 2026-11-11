// 플레이 기록 (개발 서버 전용: debug.ts 가 부른다 — 제출 빌드에는 들어가지 않는다). 계산은 explore/playlog.ts.
import type { ExploreScene } from '../scenes/ExploreScene';
import { countOpen, emptyLog, observe, table, toText, type PlayLog } from '../explore/playlog';
import { el, esc, root } from './hud';

const KEY = 'cw_playlog', TICK_MS = 250;
let log: PlayLog = emptyLog();
try { const o = JSON.parse(localStorage.getItem(KEY) ?? 'null') as PlayLog | null; if (o && o.scenes) log = o; } catch { /* 저장소 사용 불가: 이번 실행 동안만 */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(log)); } catch { /* 무시 */ } };
const MENUS = ['notebook', 'title', 'debugmenu', 'playlog'];

export function initPlayLog(scene: ExploreScene) {
  let last = Date.now(), prevOpen: string | null = null;
  window.setInterval(() => {
    const now = Date.now(), dt = Math.min(now - last, 1000); last = now;
    const open = document.getElementById('puzzle')?.dataset.pid ?? null;
    observe(log, { now, started: scene.started || scene.locked, state: scene.state, ended: !!document.getElementById('ending'), openPuzzleId: open, inMenu: MENUS.some((id) => document.getElementById(id)), hidden: document.hidden, dt });
    countOpen(log, prevOpen, open); prevOpen = open; save();
  }, TICK_MS);
}

export function togglePlayLogPanel() {
  const old = document.getElementById('playlog');
  if (old) { old.remove(); return; }
  const box = el('div', 'dbg playlog'); box.id = 'playlog';
  const render = () => {
    const t = table(log, Date.now());
    const rowsHtml = (rows: { label: string; cells: string[] }[]) => rows.map((r) => `<tr><td>${esc(r.label)}</td>${r.cells.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
    box.innerHTML = `<div class="dbgt">플레이 기록 (개발 서버 전용) — 총 ${t.total}${log.endedAt === undefined ? ' (진행 중)' : ''}</div>
      <table><tr><th>씬</th>${t.head.map((h) => `<th>${h}</th>`).join('')}</tr>${rowsHtml(t.rows)}</table>
      <table><tr><th>퍼즐</th>${t.puzzleHead.map((h) => `<th>${h}</th>`).join('')}</tr>${rowsHtml(t.puzzleRows)}</table>
      <div class="note">시각은 첫 시작부터의 경과(분:초). 소요에는 수첩·메뉴·일시정지 시간이 포함되고, 그 시간은 따로 표시한다. F9 씬 점프를 쓰면 건너뛴 씬은 0:00 으로 찍힌다.</div>
      <div><button data-a="copy">복사</button><button data-a="clear">기록 초기화</button><button data-a="close">닫기</button> <span id="plmsg"></span></div>`;
  };
  box.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button'); if (!b) return;
    const msg = (t: string) => { const m = box.querySelector('#plmsg'); if (m) m.textContent = t; };
    if (b.dataset.a === 'close') { box.remove(); clearInterval(timer); }
    else if (b.dataset.a === 'clear') { log = emptyLog(); save(); render(); }
    else if (b.dataset.a === 'copy') {
      const text = toText(log, Date.now());
      const fallback = () => { const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch { /* 무시 */ } ta.remove(); msg(ok ? '복사했다' : '복사 실패'); };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => msg('복사했다'), fallback); else fallback();
    }
  });
  const timer = window.setInterval(() => { if (!box.isConnected) { clearInterval(timer); return; } const m = box.querySelector('#plmsg')?.textContent ?? ''; render(); const n = box.querySelector('#plmsg'); if (n) n.textContent = m; }, 1000);
  root().append(box); render();
}
