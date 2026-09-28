/**
 * 항목 이름을 견주기 위해 공백을 지우고 소문자로 눕힌다.
 * "화분 물 주기" 와 "화분물주기" 는 사람에겐 같은 말이다.
 *
 * 서버 이름 일치·웹 칩 판정·오프라인 매칭이 같은 기준을 쓰도록 한곳에 둔다.
 */
export function squashName(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

/**
 * AI 가 낸 이름이 문장에 근거하는지. 두 글자 이상 낱말 하나라도 문장에 있어야 한다.
 * 한 낱말짜리 이름("차")은 한 글자여도 본다.
 * 270M 은 못 알아들은 말에 예시·목록의 이름("이불 빨래")을 지어 냈다.
 */
export function isGroundedName(name: string, text: string): boolean {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const said = squashName(text);
  return words.some(
    (word) => (word.length >= 2 || words.length === 1) && said.includes(squashName(word)),
  );
}

/**
 * AI 없이 규칙이 문장에서 뽑은 이름("고양이 모래 부었어")의 확신도.
 * 확인 시트는 열되(서버 RECOGNITION_FLOOR 0.35 위) 이름을 고칠 여지를 둔다.
 * 기기(parse-local)와 서버(capture.service)가 같은 값을 쓴다.
 */
export const RULE_NAME_CONFIDENCE = 0.5;
