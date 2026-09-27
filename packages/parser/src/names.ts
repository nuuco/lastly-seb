/**
 * 항목 이름을 견주기 위해 공백을 지우고 소문자로 눕힌다.
 * "화분 물 주기" 와 "화분물주기" 는 사람에겐 같은 말이다.
 *
 * 서버 이름 일치·웹 칩 판정·오프라인 매칭이 같은 기준을 쓰도록 한곳에 둔다.
 */
export function squashName(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}
