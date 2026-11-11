// 구역별로 끝에서 끝까지 걷는 데 걸리는 시간 (걷기 / 달리기) — 걸을 수 있는 범위(walk 또는 minX~maxX) 기준
//   npx tsx tools/walk-times.ts
import { readFileSync } from 'node:fs';

const map = JSON.parse(readFileSync('src/data/map.json', 'utf8')) as { playerSpeed: number; runMultiplier: number; areas: Record<string, { name: string; minX: number; maxX: number; walk?: { min: number; max: number } }> };
console.log(`걷기 ${map.playerSpeed}px/s · 달리기 ×${map.runMultiplier} = ${map.playerSpeed * map.runMultiplier}px/s\n\n| 구역 | 걸을 수 있는 길이(px) | 걷기(초) | 달리기(초) |\n|---|---|---|---|`);
for (const [id, a] of Object.entries(map.areas)) {
  const len = (a.walk?.max ?? a.maxX) - (a.walk?.min ?? a.minX);
  console.log(`| ${a.name} (${id}) | ${len} | ${(len / map.playerSpeed).toFixed(1)} | ${(len / (map.playerSpeed * map.runMultiplier)).toFixed(1)} |`);
}
