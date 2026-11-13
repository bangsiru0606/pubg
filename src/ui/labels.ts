import { areas } from '../explore/interaction';
import { claims, type Claim, type SourceType } from '../core';

// 화면에는 "증거"(물증·기록·맥락 자료)와 "증언"(진술) 두 분류만 보인다. 내부 판정은 3유형과 맥락 구분을 그대로 쓴다 (4차 피드백).
export const TYPE_LABEL: Record<SourceType, string> = { physical: '증거', record: '증거', testimony: '증언', context: '증거' };
export const typeGroup = (t: SourceType): 'evidence' | 'testimony' => (t === 'testimony' ? 'testimony' : 'evidence');
/** 가설 표시 순서는 질문마다 다르게 돌려 둔다 (정답이 항상 같은 자리에 오지 않게). 데이터 순서는 그대로. */
const SHIFT = [0, 1, 2, 1];
export const hypsOf = (c: Claim) => { const k = SHIFT[claims.indexOf(c)] % c.hypotheses.length; return [...c.hypotheses.slice(k), ...c.hypotheses.slice(0, k)]; };
export const areaName = (id: string) => areas[id]?.name ?? id;
