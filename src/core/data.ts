import evidenceJson from '../data/evidence.json';
import claimsJson from '../data/claims.json';
import puzzlesJson from '../data/puzzles.json';
import endingsJson from '../data/endings.json';
import type { Claim, Ending, Evidence, Puzzle } from './types';

// 형식은 `npm run validate` 가 검사한다.
export const evidenceList = evidenceJson as Evidence[];
export const claims = claimsJson as Claim[];
export const puzzles = puzzlesJson as unknown as Puzzle[];
export const endings = endingsJson as Ending[];

export const evidenceById = new Map(evidenceList.map((e) => [e.id, e]));
export const claimById = new Map(claims.map((c) => [c.claimId, c]));
export const puzzleById = new Map(puzzles.map((p) => [p.id, p]));
