import real from '../data/dialogue.json';
import type { Dialogues } from '../core';

// 테스트 전용 대사는 e2e 빌드(mode=e2e)에서만 포함된다. 일반 빌드에서는 dead code 로 제거된다.
declare const __TEST_FIXTURE__: boolean;

let extra: Dialogues = {};
if (__TEST_FIXTURE__) extra = (await import('../data/dialogue.test-fixture.json')).default.dialogues as unknown as Dialogues;

export const dialogues: Dialogues = { ...(real.dialogues as unknown as Dialogues), ...extra };
export const isTestBuild = __TEST_FIXTURE__;
