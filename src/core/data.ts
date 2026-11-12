import evidenceJson from '../data/evidence.json';
import claimsJson from '../data/claims.json';
import puzzlesJson from '../data/puzzles.json';
import endingsJson from '../data/endings.json';
import conflictsJson from '../data/conflicts.json';
import charactersJson from '../data/characters.json';
import type { Claim, Ending, EndingLine, EndingLineKey, Evidence, Puzzle } from './types';

// 형식은 `npm run validate` 가 검사한다.
export const evidenceList = evidenceJson as Evidence[];
export const claims = claimsJson as Claim[];
export const puzzles = puzzlesJson as unknown as Puzzle[];
export const endings = endingsJson.endings as Ending[];
export const endingLines = endingsJson.lines as Record<EndingLineKey, EndingLine[]>;

export const evidenceById = new Map(evidenceList.map((e) => [e.id, e]));
export const claimById = new Map(claims.map((c) => [c.claimId, c]));
export const puzzleById = new Map(puzzles.map((p) => [p.id, p]));
export const conflictPairs = conflictsJson.pairs as [string, string][];
export const characters = charactersJson.characters as { id: string; name: string; portrait: string; title?: string }[];
/** 플레이어 이름: 기본값은 characters.json 의 han_jisu (한 곳에서만 정의). 새 게임에서 이름을 입력하면 바뀐다. */
export const DEFAULT_PLAYER_NAME = characters.find((c) => c.id === 'han_jisu')!.name;
let playerName = DEFAULT_PLAYER_NAME;
export const NAME_MAX = 8;
/** 입력값 → 최종 이름: 앞뒤 공백 제거, 8자까지, 비면 기본 이름 */
export const normalizeName = (raw: string) => Array.from(raw.trim()).slice(0, NAME_MAX).join('').trim() || DEFAULT_PLAYER_NAME;
export const getPlayerName = () => playerName;
export const setPlayerName = (n: string) => { playerName = n; };
/** 대사 속 {player} 토큰을 플레이어 이름으로 바꾼다 (화면에 그리는 단계에서 치환) */
export const fmtName = (text: string) => text.split('{player}').join(playerName);
export const characterName = (id: string) => (id === 'han_jisu' ? playerName : characters.find((c) => c.id === id)?.name ?? '');
/** 화면에 쓰는 이름표: 직함이 있으면 이름 뒤에 붙인다 (이혜정 → "이혜정 이사") */
export const characterLabel = (id: string) => { const t = characters.find((c) => c.id === id)?.title; return t ? `${characterName(id)} ${t}` : characterName(id); };
