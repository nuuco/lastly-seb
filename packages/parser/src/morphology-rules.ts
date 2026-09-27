/**
 * 형태소 분석기 없이도 보존해야 하는 한국어 어미·조사 규칙.
 *
 * 이전 규칙 엔진은 형태소 분석 결과의 품사(부정 부사, 연결 어미, 주격 조사
 * 등)에 의존했다. 현재 공용 parser는 동기·무의존 패키지라 같은 의미를 표면
 * 형태로 보수적으로 재현한다. 확신을 높이는 용도가 아니라 잘못된 완료 저장을
 * 막는 안전 신호가 이 모듈의 우선 목적이다.
 */

export type MorphologySignals = {
  negative: boolean;
  nearMiss: boolean;
  intended: boolean;
  uncertain: boolean;
  thirdPerson: boolean;
  nonAssertion: boolean;
  nonActionPredicate: boolean;
  completed: boolean;
};

/** 생활 행동 동사의 어간. 붙여 쓴 음성 인식 결과의 부정도 잡기 위해 쓴다. */
const ACTION_STEM =
  '(?:빨|갈|읽|씻|닦|주|줘|줬|먹|넣|열|닫|잠그|교체|바꾸|정리|청소|설치|세탁|치우|버리|비우|충전|소독|살균|점검|복용|물갈이|분갈이|빗질|양치|세차|환기|산책|제거|널|깎|개|채우|삶|뒤집|돌리|말리|털|접|헹|묶|옮|볶|다듬|달|꿰매|불리|깔|쌓|치대|부치|뿌리|맞추|걸)';

const SPACED_NEGATION = new RegExp(`(?:^|\\s)(?:안|못)\\s*${ACTION_STEM}`);
const ATTACHED_NEGATION = new RegExp(`(?:^|[가-힣])(?:안|못)${ACTION_STEM}`);

const SELF_PREFIX = /^(?:나|나는|난|내가|저|저는|제가)(?=\s|$)/;
const PERSONAL_TOPIC = /^(?:친구|남편|아내|엄마|아빠|아이|동생|언니|오빠|누나|형|할머니|할아버지|고양이|강아지)(?:은|는)(?=\s)/;
const THIRD_PERSON_SUBJECT =
  /^(?:[가-힣]{1,20})(?:가|께서)(?=\s)|^(?:친구|남편|아내|엄마|아빠|동생|언니|오빠|누나|형|할머니|할아버지|고양이|강아지)이(?=\s)/;

const PAST_ENDING = /(?:(?:[가-힣]+)?(?:았|었|였|했|됐|줬|갔|왔|봤|났|졌|렸|쳤|썼|웠)(?:어|어요|다|음|지))(?=\s|[.!?~…]|$)/;
const CONNECTED_PAST_ENDING = /(?:[가-힣]+)?(?:았|었|였|했|됐|줬|갔|왔|봤|났|졌|렸|쳤|켰|썼|웠)고(?=\s|[.!?~…]|$)/;
const REPORTED_SPEECH = /(?:대|다며|라며|던데)(?=\s|[.!?~…]|$)/;

/** "빨려고 했어"의 했어는 수행 완료가 아니라 시도/의도 보조 용언이다. */
export function withoutIntentionAuxiliary(text: string): string {
  return text
    // "읽어야 했어", "청소해야 했어"의 과거형은 수행 완료가 아니라 의무다.
    .replace(/[가-힣]+(?:어야|아야|여야|해야)\s*했(?:어|어요|다|음)?/g, ' ')
    // "청소하고 싶었어"의 과거형은 희망이지 수행 사실이 아니다.
    .replace(/[가-힣]+고\s*싶(?:었어|었어요|었|어|어요|다|음)?/g, ' ')
    .replace(/[가-힣]+(?:으려고|려고|려다|려다가)\s*했(?:어|어요|다|음)?/g, ' ')
    .replace(/[가-힣]+\s*(?:생각|예정|계획|참)이었(?:어|어요|다|음)?/g, ' ')
    .replace(/[가-힣]+(?:을까|ㄹ까|까)\s*했(?:어|어요|다|음)?/g, ' ')
    // 앞 절 전체를 탐욕적으로 먹지 않도록 미래 동사 어미만 제거한다.
    // 예: "청소했고 ... 할거야"에서 앞의 "청소했고"는 완료로 남아야 한다.
    .replace(/(?:할|갈|빨|읽을|먹을|닦을|넣을|채울|깎을|줄|시킬|버릴|쓸|올)\s*(?:거야|게|래)/g, ' ');
}

export function readMorphologySignals(text: string): MorphologySignals {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const direct = withoutIntentionAuxiliary(normalized);
  const selfRemoved = normalized.replace(SELF_PREFIX, '').trim();

  const negative =
    SPACED_NEGATION.test(normalized) ||
    ATTACHED_NEGATION.test(normalized) ||
    /(?:^|\s)(?:안|못)\s*(?:했|했어|했어요|했다|함)/.test(normalized) ||
    /(?:하지|하 지|지)\s*(?:못|않)/.test(normalized) ||
    /아직\s*(?:안|못)/.test(normalized);

  const nearMiss =
    /뻔(?:했|해|한다|했다)?/.test(normalized) ||
    /(?:으려고|려고|려다|려다가|다가)\s*(?:말|그만|실패|중단|포기)/.test(normalized);

  const intended =
    /(?:으려고|려고|려다|려다가|을까|ㄹ까|[가-힣]+까\s*했)/.test(normalized) ||
    /(?:어|아|여)야(?:\s|$)/.test(normalized) ||
    /(?:할|갈|빨|읽을|먹을|닦을|청소할|정리할)\s*(?:거야|게|래)/.test(normalized) ||
    /[가-힣]+\s*(?:생각|예정|계획|참)/.test(normalized) ||
    /(?:하고|해|하)\s*싶/.test(normalized) ||
    /예정|계획/.test(normalized);

  const uncertain =
    /아마|어쩌면/.test(normalized) ||
    /수\s*도\s*(?:있|없)/.test(normalized) ||
    /(?:것|거)\s*같/.test(normalized) ||
    /듯(?:해|하|했|싶)/.test(normalized) ||
    /(?:는지|은지|ㄴ지)\s*(?:모르|기억)/.test(normalized) ||
    /(?:았|었|였|했)(?:나|던가)(?=\s|[.!?~…]|$)/.test(normalized) ||
    REPORTED_SPEECH.test(normalized) ||
    /기억|모르/.test(normalized) ||
    /(?:다고|라고)\s*(?:들|했|하)/.test(normalized) ||
    /줄\s*알/.test(normalized) ||
    /나\s*봐/.test(normalized);

  const thirdPerson = PERSONAL_TOPIC.test(selfRemoved) || THIRD_PERSON_SUBJECT.test(selfRemoved);
  const nonAssertion =
    /(?:다고|라고)\s*(?:들|했|하)/.test(normalized) ||
    REPORTED_SPEECH.test(normalized) ||
    /(?:는데|지만)(?=\s|[,.!?~…]|$)/.test(normalized) ||
    /(?:으면|면)(?=\s|[,.!?~…]|$)/.test(normalized);

  const nonActionPredicate =
    /(?:^|\s)(?:피곤|맛있|예쁘|예뻐|좋|비싸|아프|졸리|행복|슬프|필요|괜찮|바쁘|힘들|춥|덥|무섭|재밌|재미있|싫|귀찮)[가-힣]*(?=[.!?~…]?$)/.test(
      normalized,
    );

  return {
    negative,
    nearMiss,
    intended,
    uncertain,
    thirdPerson,
    nonAssertion,
    nonActionPredicate,
    completed: PAST_ENDING.test(direct) || CONNECTED_PAST_ENDING.test(direct),
  };
}
