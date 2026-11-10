import { areas } from '../explore/interaction';
import type { SourceType } from '../core';

export const TYPE_LABEL: Record<SourceType, string> = { physical: '물증', record: '기록', testimony: '증언', context: '맥락' };
export const areaName = (id: string) => areas[id]?.name ?? id;
