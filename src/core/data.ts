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
export const characters = charactersJson.characters as { id: string; name: string; portrait: string }[];
export const characterName = (id: string) => characters.find((c) => c.id === id)?.name ?? '';
