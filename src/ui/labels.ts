import { areas } from '../explore/interaction';
import { claims, type Claim, type SourceType } from '../core';

export const TYPE_LABEL: Record<SourceType, string> = { physical: '물증', record: '기록', testimony: '증언', context: '맥락' };
/** 가설 표시 순서는 질문마다 다르게 돌려 둔다 (정답이 항상 같은 자리에 오지 않게). 데이터 순서는 그대로. */
const SHIFT = [0, 1, 2, 1];
export const hypsOf = (c: Claim) => { const k = SHIFT[claims.indexOf(c)] % c.hypotheses.length; return [...c.hypotheses.slice(k), ...c.hypotheses.slice(0, k)]; };
export const areaName = (id: string) => areas[id]?.name ?? id;
