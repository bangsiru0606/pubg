// 데이터 ID 참조 무결성. 1단계: map.json 이 참조하는 텍스처가 정규화 결과에 있는지.
import { existsSync } from 'node:fs';
import map from '../src/data/map.json' with { type: 'json' };

const bad = map.office.objects.filter((o) => !existsSync(`public/assets/${o.tex}.png`));
if (bad.length) { console.error('누락 에셋:', bad.map((o) => o.tex).join(', ')); process.exit(1); }
console.log('validate OK');
