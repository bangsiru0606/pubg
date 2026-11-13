import { describe, expect, it } from 'vitest';
import { fixJosa, josa, withJosa } from '../src/core';

describe('조사 고르기 (앞 글자 받침 기준)', () => {
  it('와/과', () => { expect(josa('기도대', '와/과')).toBe('와'); expect(josa('메모', '와/과')).toBe('와'); expect(josa('진술', '와/과')).toBe('과'); expect(josa('혈흔', '와/과')).toBe('과'); });
  it('을/를·은/는·이/가', () => {
    expect(withJosa('손목띠 조각', '을/를')).toBe('손목띠 조각을'); expect(withJosa('메모', '을/를')).toBe('메모를');
    expect(withJosa('원장', '은/는')).toBe('원장은'); expect(withJosa('의자', '은/는')).toBe('의자는');
    expect(withJosa('열상', '이/가')).toBe('열상이'); expect(withJosa('시각', '이/가')).toBe('시각이'); expect(withJosa('기록', '이/가')).toBe('기록이');
  });
  it('으로/로: ㄹ 받침과 받침 없음은 로, 그 밖의 받침은 으로', () => {
    expect(josa('서랍', '으로/로')).toBe('으로'); expect(josa('기록', '으로/로')).toBe('으로'); // ㅂ·ㄱ 받침
    expect(josa('지하실', '으로/로')).toBe('로'); expect(josa('연결표', '으로/로')).toBe('로'); expect(josa('이사', '으로/로')).toBe('로'); // ㄹ 받침·받침 없음
    expect(josa('손목띠 조각', '으로/로')).toBe('으로'); expect(josa('검안 기록 수정 이력', '으로/로')).toBe('으로'); // 력: ㄱ 받침
    expect(josa('열쇠', '으로/로')).toBe('로');
  });
  it('「」·‘’·따옴표·괄호는 건너뛰고 그 앞 글자를 본다', () => {
    expect(withJosa('「예비 검안 메모」', '와/과')).toBe('「예비 검안 메모」와'); expect(withJosa('「기도대 아래 혈흔」', '와/과')).toBe('「기도대 아래 혈흔」과');
    expect(withJosa('‘충돌로 인한 외상’', '을/를')).toBe('‘충돌로 인한 외상’을'); expect(withJosa('“의식없음”', '은/는')).toBe('“의식없음”은');
    expect(withJosa('(구조 지연)', '이/가')).toBe('(구조 지연)이');
  });
  it('숫자·영문 끝: P-271 은 일(ㄹ 받침), 3 은 삼, 2 는 이', () => {
    expect(withJosa('P-271', '으로/로')).toBe('P-271로'); expect(withJosa('P-271', '은/는')).toBe('P-271은'); expect(withJosa('2병동', '이/가')).toBe('2병동이');
    expect(withJosa('EW-0827', '을/를')).toBe('EW-0827을'); expect(withJosa('3', '이/가')).toBe('3이'); expect(withJosa('2', '이/가')).toBe('2가'); expect(withJosa('BSW', '은/는')).toBe('BSW는');
  });
  it('문장 속 “은(는)”·“와(과)”·“(으)로”·“을(를)”·“이(가)” 표기를 하나로 고친다', () => {
    expect(fixJosa('「찢어진 손목띠 조각」은(는) 이 설명과 맞지 않는다.')).toBe('「찢어진 손목띠 조각」은 이 설명과 맞지 않는다.');
    expect(fixJosa('「예비 검안 메모」와(과) 「기도대 아래 혈흔」은(는) 맞지 않는다.')).toBe('「예비 검안 메모」와 「기도대 아래 혈흔」은 맞지 않는다.');
    expect(fixJosa('‘발견 위치’ 줄은(는) ‘충돌로 인한 외상’을(를) 숨긴다')).toBe('‘발견 위치’ 줄은 ‘충돌로 인한 외상’을 숨긴다');
    expect(fixJosa('「검안 기록 수정 이력」(으)로 막는다')).toBe('「검안 기록 수정 이력」으로 막는다');
    expect(fixJosa('「연결표」(으)로, 「열쇠」이(가) 열린다')).toBe('「연결표」로, 「열쇠」가 열린다');
    expect(fixJosa('조사가 없는 문장')).toBe('조사가 없는 문장');
  });
});
