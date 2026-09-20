/**
 * 로그로 남길지 여부.
 *
 * 완료한 일만 저장한다. 예정·못 함·애매한 부정은 저장하면 없던 일이 생긴다.
 * "베개만 빨았어"처럼 다른 일을 빼고 한 일은 저장한다.
 */

const DONE_VERB =
  /(?:했어|했다|했음|빨았어|빨아놨어|갈았어|닦았어|돌렸어|버렸어|끝냈어|시켰어|청소했어)/;

export function shouldRecordLog(text: string): boolean {
  const t = text.replace(/\s+/g, ' ');
  const hardFail =
    /못\s*했|안\s*했|하지\s*못|아직(?:이야|\s*안|\s*못)|(?:못|안)\s*(?:빨았|갈았|닦았|시켰|버렸|돌렸)|못\s*한|안\s*한/.test(
      t,
    );
  if (hardFail) return false;

  /**
   * 앞으로 하겠다는 말. "청소했어 한달에 한번 할래" 의 할래는 주기이지 예정이 아니다.
   * 완료 동사가 있으면 할래/할 거야만으로는 막지 않는다.
   */
  const done = DONE_VERB.test(t);
  const future =
    /내일|모레|이따가|예정|하려고|빨\s*거야|시킬게|버릴게|돌릴\s*예정|다음\s*주|주말에/.test(t) ||
    (!done && /할(?:래|게)|할\s*거야/.test(t));
  const only = /만\s*(?:빨|갈|닦|했|끝냈)/.test(t);
  if (future && only && done) return true;
  if (future) return false;
  return true;
}
