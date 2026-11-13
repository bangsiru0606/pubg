// 한국어 조사 고르기 (순수 함수). 앞 글자의 받침 유무로 골라 붙인다. 「」·‘’·따옴표·괄호는 건너뛰고 그 앞의 글자를 본다.
export type JosaKind = '와/과' | '으로/로' | '을/를' | '이/가' | '은/는';

// 숫자 읽기의 받침: 영(ㅇ) 일(ㄹ) 이 삼(ㅁ) 사 오 육(ㄱ) 칠(ㄹ) 팔(ㄹ) 구
const DIGIT: Record<string, [boolean, boolean]> = { 0: [true, false], 1: [true, true], 2: [false, false], 3: [true, false], 4: [false, false], 5: [false, false], 6: [true, false], 7: [true, true], 8: [true, true], 9: [false, false] };
// 알파벳 이름의 받침: 엘·엠·엔·알(L M N R)·에프(F 없음)… 받침이 있는 것만 적는다
const LETTER: Record<string, [boolean, boolean]> = { l: [true, true], r: [true, true], m: [true, false], n: [true, false], q: [false, false] };

/** 마지막으로 읽히는 글자의 받침 { 있다, ㄹ 받침이다 } */
function lastSound(text: string): { batchim: boolean; rieul: boolean } {
  for (let i = text.length - 1; i >= 0; i--) {
    const ch = text[i], code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) { const jong = (code - 0xac00) % 28; return { batchim: jong > 0, rieul: jong === 8 }; }
    if (/[0-9]/.test(ch)) { const [b, r] = DIGIT[ch]; return { batchim: b, rieul: r }; }
    if (/[a-zA-Z]/.test(ch)) { const [b, r] = LETTER[ch.toLowerCase()] ?? [false, false]; return { batchim: b, rieul: r }; }
    // 그 밖(공백·따옴표·괄호·낫표·문장부호)은 건너뛴다
  }
  return { batchim: false, rieul: false };
}

/** word 에 붙는 조사만 돌려준다: josa('기도대', '와/과') → '와' */
export function josa(word: string, kind: JosaKind): string {
  const { batchim, rieul } = lastSound(word);
  const [withB, noB] = kind.split('/');
  if (kind === '으로/로') return batchim && !rieul ? '으로' : '로'; // ㄹ 받침은 받침이 없는 것처럼 '로'
  return kind === '와/과' ? (batchim ? noB : withB) : batchim ? withB : noB; // 와/과 만 받침 없는 쪽이 앞에 적힌다
}
/** word + 조사: withJosa('손목띠 조각', '을/를') → '손목띠 조각을' */
export const withJosa = (word: string, kind: JosaKind) => word + josa(word, kind);

const PAIRS: Record<string, JosaKind> = { '와(과)': '와/과', '과(와)': '와/과', '은(는)': '은/는', '는(은)': '은/는', '을(를)': '을/를', '를(을)': '을/를', '이(가)': '이/가', '가(이)': '이/가', '(으)로': '으로/로', '으(로)': '으로/로' };
/** 문장 속의 "와(과)·은(는)·을(를)·이(가)·(으)로" 표기를 앞 글자에 맞는 조사 하나로 바꾼다 (데이터 문장을 화면에 낼 때 쓴다) */
export const fixJosa = (text: string) =>
  text.replace(/와\(과\)|과\(와\)|은\(는\)|는\(은\)|을\(를\)|를\(을\)|이\(가\)|가\(이\)|\(으\)로|으\(로\)/g, (m, offset: number) => josa(text.slice(0, offset), PAIRS[m]));
