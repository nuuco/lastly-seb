/**
 * 한국어 한 문장에서 규칙만으로 뽑아낼 수 있는 것들.
 *
 * 해석에 필요한 다섯 가지 중 넷은 말의 형태만 보면 정해진다. 측정해 보면
 * 의도·날짜·주기는 규칙이 전부 맞히고, LLM 이 필요한 건 이름 정규화뿐이다.
 * 그 넷을 먼저 처리해 두면 LLM 을 부르지 않고 끝나는 문장이 크게 늘어난다.
 *
 * 항목 이름의 "대상"(가습기 필터, 블라인드…)은 끝이 없지만 "행동"(빨다, 갈다,
 * 닦다…)은 몇 개뿐이다. 그래서 대상은 사용자가 말한 그대로 두고 행동만 바꾼다.
 * 처음 보는 대상이어도 사전에 없을 이유가 없다.
 */

export type Intent = 'record' | 'query';

export type SaveKind =
  | 'completed'
  | 'query'
  | 'incomplete'
  | 'planned'
  | 'uncertain'
  | 'none';

export interface SaveDecision {
  intent: Intent;
  /** 조회·못 함·예정·불확실이면 false. */
  willSave: boolean;
  kind: SaveKind;
}

export interface UtteranceFacts {
  intent: Intent;
  willSave: boolean;
  /** 기준일로부터 며칠 전인지. 시간 표현이 없으면 0. */
  daysAgo: number;
  /** 문장에서 직접 말한 주기(일). 말하지 않았으면 null. */
  statedCadenceDays: number | null;
  /** 정규화한 항목 이름. 남는 말이 없으면 null. */
  name: string | null;
  /** 날짜·주기를 문장에서 실제로 읽어냈는지. 확신도를 매길 때 쓴다. */
  sawDate: boolean;
  /**
   * 아는 행동("빨았어", "닦았다")을 찾아냈거나, 완료 표지 뒤에 남는 말이 있는지.
   *
   * 못 찾았으면 name 은 그저 남은 말일 뿐이다. "음 그러니까 그거" 같은 문장도
   * 지우고 나면 뭔가 남으므로, 이 표시가 없으면 이름으로 믿어서는 안 된다.
   */
  sawAction: boolean;
}

/** 한자어 수사. "세달에 한번" 의 "세". */
const SINO_NATIVE: Record<string, number> = {
  한: 1, 두: 2, 세: 3, 석: 3, 네: 4, 넉: 4,
  다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10,
  일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9, 십: 10,
};

/** 날짜를 통째로 가리키는 고유어. "이틀에 한번" 은 2일이지, 2 × 틀이 아니다. */
const DAY_WORDS: Record<string, number> = {
  하루: 1, 이틀: 2, 사흘: 3, 나흘: 4, 닷새: 5,
  엿새: 6, 이레: 7, 여드레: 8, 아흐레: 9, 열흘: 10, 보름: 15,
};

const UNIT_DAYS: Record<string, number> = {
  일: 1, 주: 7, 주일: 7, 달: 30, 개월: 30, 년: 365, 해: 365,
};

const WEEKDAYS = '월화수목금토일';

/** 주기를 1일~2년으로 묶는다. 이 밖이면 잘못 읽은 것으로 본다. */
const MIN_CADENCE_DAYS = 1;
const MAX_CADENCE_DAYS = 730;

function toNumber(token: string): number | null {
  const t = token.trim();
  if (/^\d+$/.test(t)) return Number(t);
  return SINO_NATIVE[t] ?? null;
}

function clampCadence(days: number): number | null {
  if (!Number.isFinite(days)) return null;
  return days >= MIN_CADENCE_DAYS && days <= MAX_CADENCE_DAYS ? days : null;
}

/* ─────────────────────────── 주기 ─────────────────────────── */

/**
 * 앞으로 얼마마다 할지. "언제 했는지" 와 헷갈리면 안 된다.
 * "3일 전에 했어" 는 주기가 아니라 날짜다.
 */
export function readCadenceDays(text: string): number | null {
  // "이틀에 한번", "열흘마다" — 날짜 고유어가 단위를 겸한다.
  for (const [word, days] of Object.entries(DAY_WORDS)) {
    const re = new RegExp(`${word}\\s*(에\\s*(한|1)\\s*번|마다|에\\s*한\\s*번씩)`);
    if (re.test(text)) return clampCadence(days);
  }

  // "한달에 한번", "일주일에 한번", "3일에 한번씩"
  const perMatch = text.match(
    /([\d]+|[가-힣])\s*(주일|개월|주|달|일|년|해)\s*에\s*(?:한|1)\s*번/,
  );
  if (perMatch) {
    const n = toNumber(perMatch[1]!);
    const unit = UNIT_DAYS[perMatch[2]!];
    if (n && unit) return clampCadence(n * unit);
  }

  // "2주마다", "45일마다", "한달마다"
  const everyMatch = text.match(/([\d]+|[가-힣])\s*(주일|개월|주|달|일|년|해)\s*마다/);
  if (everyMatch) {
    const n = toNumber(everyMatch[1]!);
    const unit = UNIT_DAYS[everyMatch[2]!];
    if (n && unit) return clampCadence(n * unit);
  }

  // 단위만 말한 경우 — "매일", "격주"
  if (/매일|날마다/.test(text)) return 1;
  if (/매주/.test(text)) return 7;
  if (/격주/.test(text)) return 14;
  if (/매달|매월/.test(text)) return 30;
  if (/매년|해마다/.test(text)) return 365;

  return null;
}

/* ─────────────────────────── 날짜 ─────────────────────────── */

/**
 * 며칠 전인지. 기준일의 요일을 알아야 "지난주 일요일" 을 셀 수 있다.
 *
 * 미래를 가리키는 말("내일")은 다루지 않는다. 이미 한 일을 남기는 앱이라
 * 그런 문장은 들어올 자리가 없고, 들어와도 0(오늘)으로 두는 편이 안전하다.
 */
export function readDaysAgo(text: string, reference: Date): { daysAgo: number; saw: boolean } {
  // 주기 표현을 먼저 지운다. "3일에 한번" 의 "3일" 을 날짜로 읽으면 안 된다.
  const t = stripCadence(text);

  const nDaysAgo = t.match(/(\d+)\s*일\s*전/);
  if (nDaysAgo) return { daysAgo: Number(nDaysAgo[1]), saw: true };

  const nWeeksAgo = t.match(/(\d+)\s*(?:주일|주)\s*전/);
  if (nWeeksAgo) return { daysAgo: Number(nWeeksAgo[1]) * 7, saw: true };

  const nMonthsAgo = t.match(/(\d+)\s*(?:개월|달)\s*전/);
  if (nMonthsAgo) return { daysAgo: Number(nMonthsAgo[1]) * 30, saw: true };

  for (const [word, days] of Object.entries(DAY_WORDS)) {
    if (new RegExp(`${word}\\s*전`).test(t)) return { daysAgo: days, saw: true };
  }

  if (/그끄저께|그그제/.test(t)) return { daysAgo: 3, saw: true };
  if (/그저께|그제/.test(t)) return { daysAgo: 2, saw: true };
  if (/어제|어저께/.test(t)) return { daysAgo: 1, saw: true };

  /**
   * "지난주 일요일" — 기준일에서 거슬러 올라가 가장 가까운 그 요일을 찾고,
   * 그게 이번 주 안이면 한 주 더 뺀다. "지난" 이 붙었으니 최소 7일 전이다.
   */
  const lastWeekday = t.match(/(?:지난|저번|작)\s*주\s*([월화수목금토일])\s*요일/);
  if (lastWeekday) {
    const target = WEEKDAYS.indexOf(lastWeekday[1]!);
    const diff = (reference.getDay() + 6) % 7; // 월=0 으로 맞춘다
    let back = (diff - target + 7) % 7;
    if (back < 7) back += 7;
    return { daysAgo: back, saw: true };
  }

  // 요일만 말한 경우 — "일요일에 했어". 이번 주 안에서 거슬러 올라간다.
  const weekdayOnly = t.match(/([월화수목금토일])\s*요일/);
  if (weekdayOnly) {
    const target = WEEKDAYS.indexOf(weekdayOnly[1]!);
    const diff = (reference.getDay() + 6) % 7;
    const back = (diff - target + 7) % 7;
    return { daysAgo: back, saw: true };
  }

  if (/(?:지난|저번|작)\s*주/.test(t)) return { daysAgo: 7, saw: true };
  if (/(?:지난|저번)\s*달|지난\s*개월/.test(t)) return { daysAgo: 30, saw: true };
  if (/작년|지난\s*해/.test(t)) return { daysAgo: 365, saw: true };
  if (/오늘|방금|아까|막/.test(t)) return { daysAgo: 0, saw: true };

  return { daysAgo: 0, saw: false };
}

/* ─────────────────────────── 의도 ─────────────────────────── */

/**
 * 기록인가 질문인가.
 *
 * 같은 입력창에 "이불 빨았어"(기록)와 "이불 언제 빨았어?"(조회)가 함께 들어온다.
 * 둘을 구분하지 못하면 물어본 것을 기록으로 남겨 없던 일이 생긴다.
 */
const QUERY = [
  /\?|？/,
  /언제|얼마나|며칠|얼마만|몇\s*일|알려\s*줘|알려줄래/,
  // "간 지 됐어" 처럼 묻는 꼴
  /지\s*(얼마|몇)/,
];

export function readIntent(text: string): Intent {
  return anyMatch(text, rules('query')) ? 'query' : 'record';
}

/* ─────────────────────────── 저장 여부 ─────────────────────────── */

const INCOMPLETE = [
  /못\s*(?:했|갈|빨|닦|버리|버렸|돌리|시키|끝냈)/,
  /안\s*(?:했어|했고|갈았|빨았|닦았|버렸|돌렸|시켰|끝냈|한|빨았나)/,
  /아직\s*(?:못|안)|아직이야|아직이고/,
  /하지\s*(?:못|않)|지\s*(?:못했|않았)/,
];

/** 완료가 없을 때만 본다. 맨 /거야/ 는 "그거야" 까지 예정으로 잡아서 빼 둔다. */
const PLANNED = [
  /할래/, /할게/, /시킬게/, /버릴게/, /하려고/, /려고(?:\s|$)/, /할\s*거야/, /빨\s*거야/,
  /예정/, /이따가/, /오늘\s*(?:저녁|밤)에/,
  /내일(?!로)/, /모레/, /주말에/, /다음\s*주에/,
];

/** 시각 어림(쯤)·서술 인가 는 빼 둔다. "세 시쯤 빨았어" 를 막으면 안 된다. */
const UNCERTAIN = [
  /것\s*같/, /아마/, /더라/, /였나/, /했던가/, /지\s*싶/,
  /기억이\s*안/, /모르겠어/,
];

const COMPLETED = [
  /했고/, /했어/, /했다/, /했어요/, /했습니다/, /했음/, /해놨어/,
  /끝냈어/, /갈았어/, /빨았어/, /빨아놨어/, /버렸어/, /돌렸어/, /시켰어/, /닦았어/,
  /함(?:\s|[.,!?~…]|$)/,
];

function anyMatch(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function hasCompletedMarker(text: string): boolean {
  return anyMatch(text, rules('completed'));
}

/** "빨았어, 일주일마다 알려줘" 는 조회가 아니라 기록+알림이다. */
function readIntentFixed(text: string): Intent {
  const intent = readIntent(text);
  if (intent !== 'query') return intent;
  if (!/알려\s*줘|알려줄래/.test(text)) return intent;
  if (/(?:언제|얼마나|며칠|얼마만|몇\s*일|지\s*(?:얼마|몇)|\?|？)/.test(text)) return 'query';
  if (hasCompletedMarker(text)) return 'record';
  return intent;
}

/**
 * 조회는 readIntent 가 이미 가른다. 여기서는 저장을 막을 표지만 본다.
 * 완료 동사가 있으면 할거야/하려고는 예정이 아니라 주기다.
 */
function classifyKind(text: string): Exclude<SaveKind, 'query'> {
  const t = text.replace(/\s+/g, ' ');
  if (anyMatch(t, rules('incomplete'))) return 'incomplete';
  if (anyMatch(t, rules('uncertain'))) return 'uncertain';
  const completed = anyMatch(t, rules('completed'));
  if (anyMatch(t, rules('planned')) && !completed) return 'planned';
  if (completed) return 'completed';
  return 'none';
}

export function classifySave(text: string): SaveDecision {
  const intent = readIntentFixed(text);
  if (intent === 'query') return { intent, willSave: false, kind: 'query' };
  const kind = classifyKind(text);
  const blocked = kind === 'incomplete' || kind === 'planned' || kind === 'uncertain';
  return { intent, willSave: !blocked, kind };
}

/* ─────────────────────────── 이름 ─────────────────────────── */

/**
 * 행동을 나타내는 말 → 항목 이름에 쓸 명사.
 *
 * 대상이 아니라 행동만 담는다. 대상은 사용자가 말한 그대로 남기므로
 * 처음 보는 물건이어도 사전에 없을 이유가 없다.
 * 생활 관리 전반으로 넓히려면 여기에 한 줄씩 더하면 된다.
 */
const ACTION_NOUNS: Array<[RegExp, string]> = [
  /**
   * 그 자체가 행동인 말들. 뒤에 "했어" 가 붙어도 이름은 그대로다.
   *
   * 이것들이 없으면 이름은 맞게 나오는데 sawAction 이 서지 않아, 규칙이 자기 답을
   * 믿지 못하고 AI 로 넘긴다. 평가 문장 50개 중 10개가 이 경우였다 —
   * "설거지 했어" 처럼 더 볼 것도 없는 문장까지 LLM 을 부르고 있었다.
   */
  [/설거지\s*(?:했|해|할|하)[가-힣]*/, '설거지'],
  [/다림질\s*(?:했|해|할|하)[가-힣]*/, '다림질'],
  [/분리\s*수거\s*(?:했|해|할|하)[가-힣]*/, '분리수거'],
  [/세차\s*(?:했|해|할|하)[가-힣]*/, '세차'],
  [/환기\s*(?:했|해|할|하|시)[가-힣]*/, '환기'],
  [/산책\s*(?:했|해|할|하|시)[가-힣]*/, '산책'],
  [/제거\s*(?:했|해|할|하)[가-힣]*/, '제거'],
  [/물갈이\s*(?:했|해|할|하)[가-힣]*/, '물갈이'],
  [/분갈이\s*(?:했|해|할|하)[가-힣]*/, '분갈이'],
  [/빗질\s*(?:했|해|할|하)[가-힣]*/, '빗질'],
  [/양치\s*(?:했|해|할|하|시)[가-힣]*/, '양치'],

  // 좁은 것부터 본다. "빨래 널었어" 의 "빨래" 가 동사로 먹히면 안 된다.
  [/널(?:었|어|을|기)[가-힣]*/, '널기'],
  [/깎(?:았|아|을|기)[가-힣]*/, '깎기'],
  // "이불 갰어" 는 개어 두는 일이므로 정리로 묶는다. 사전의 "이불 정리" 와 만난다.
  [/갰[가-힣]*|개(?:어|었)[가-힣]*/, '정리'],
  // "워셔액 넣었어", "세제 채웠어" — 다 떨어져 다시 채우는 일이다.
  [/넣(?:었|어|을)[가-힣]*|채(?:웠|우)[가-힣]*/, '보충'],
  [/삶(?:았|아|을|기)[가-힣]*/, '삶기'],
  [/뒤집(?:었|어|을|기)[가-힣]*/, '뒤집기'],
  [/목욕\s*(?:했|해|할|하|시)[가-힣]*/, '목욕'],
  [/돌(?:렸|리)[가-힣]*/, '돌리기'],
  [/세척\s*(?:했|해|할|하)[가-힣]*/, '세척'],

  [/세탁\s*(?:했|해|할|하)[가-힣]*|빨래\s*(?:했|해|할|하)[가-힣]*|빨(?:았|아)[가-힣]*/, '빨래'],
  [/교체\s*(?:했|해|할|하)[가-힣]*|갈(?:았|아|을|기)[가-힣]*|바꾸[가-힣]*|바꿨[가-힣]*/, '교체'],
  [/청소\s*(?:했|해|할|하)[가-힣]*|닦(?:았|아|을|기)[가-힣]*|치웠[가-힣]*|치우[가-힣]*/, '청소'],
  [/물\s*(?:줬|주|줄|주기)[가-힣]*/, '물 주기'],
  [/정리\s*(?:했|해|할|하)[가-힣]*|정돈\s*(?:했|해|할|하)[가-힣]*/, '정리'],
  // 버리기와 비우기는 다른 일이다. 쓰레기는 버리고 물통은 비운다.
  [/버(?:렸|리)[가-힣]*/, '버리기'],
  [/비(?:웠|우)[가-힣]*/, '비우기'],
  [/충전\s*(?:했|해|할|하)[가-힣]*/, '충전'],
  [/소독\s*(?:했|해|할|하)[가-힣]*|살균\s*(?:했|해|할|하)[가-힣]*/, '소독'],
  [/점검\s*(?:했|해|할|하)[가-힣]*|확인했[가-힣]*/, '점검'],
  [/복용\s*(?:했|해|할|하)[가-힣]*|먹었[가-힣]*/, '복용'],
];

/**
 * 일을 끝냈다는 표시. 무엇을 했는지는 목적어에 있으므로 이름에 남기지 않는다.
 * "설거지 끝냈어" 의 이름은 "설거지" 이지 "설거지 끝내기" 가 아니다.
 */
const DONE_MARKERS = /(?:끝냈|끝내|마쳤|마무리했|해치웠|완료했)[가-힣]*/g;

/** 이름에 들어가면 안 되는 시간 표현. */
const TIME_EXPR =
  /(아침|점심|저녁|밤|새벽|오전|오후|오늘|어제|어저께|그저께|그제|그끄저께|그그제|방금|아까|막|마지막으로|(?:지난|저번|작)\s*주\s*[월화수목금토일]\s*요일|(?:지난|저번|작)\s*주|(?:지난|저번)\s*달|작년|[월화수목금토일]\s*요일|\d+\s*(?:일|주일|주|개월|달|년)\s*전|하루\s*전|이틀\s*전|사흘\s*전|나흘\s*전|열흘\s*전)/g;

/**
 * 말버릇으로 붙는 1인칭 주어. 항목 이름에 들어갈 자리가 아니다.
 * 한 낱말 전체가 일치할 때만 지운다 — "나무 물 주기" 의 "나무" 를 건드리면 안 된다.
 */
const FIRST_PERSON = /(?:^|\s)(?:나는|나도|내가|나|저는|제가|저)(?=\s|$)/g;

/** 이름에 들어가면 안 되는 의문 표현. */
const QUERY_EXPR = /(언제|얼마나|며칠|얼마만|몇\s*일|알려\s*줘|알려줄래|지\s*(?:얼마|몇))/g;

function stripCadence(text: string): string {
  let s = text;
  for (const word of Object.keys(DAY_WORDS)) {
    s = s.replace(new RegExp(`${word}\\s*(?:에\\s*(?:한|1)\\s*번(?:씩)?|마다)`, 'g'), ' ');
  }
  s = s.replace(
    /([\d]+|[가-힣])\s*(?:주일|개월|주|달|일|년|해)\s*에\s*(?:한|1)\s*번(?:씩)?/g,
    ' ',
  );
  s = s.replace(/([\d]+|[가-힣])\s*(?:주일|개월|주|달|일|년|해)\s*마다/g, ' ');
  s = s.replace(/(매일|날마다|매주|격주|매달|매월|매년|해마다)/g, ' ');
  return s;
}

/**
 * 문장에서 항목 이름을 뽑는다.
 *
 * 지우는 순서가 중요하다. 주기("한달에 한번")를 먼저 지워야 그 안의 "달"과
 * 숫자가 날짜나 이름으로 새어 나가지 않는다.
 */
/**
 * 미래 관형형인지. "뺄 거야" 의 "뺄", "갈 거야" 의 "갈" 을 가리킨다.
 *
 * ㄹ 받침으로 끝나는 글자가 그 형태다. 이걸 못 알아보면 "거야" 만 떨어져 나가고
 * 동사가 홀로 남아 이름에 붙는다 — 실제로 "운동화 앞으로 뺄 빨래" 가 되어 나왔다.
 *
 * "이불" 처럼 ㄹ 받침으로 끝나는 명사도 있지만, 바로 뒤에 "거야" 가 오는 자리에서는
 * 앞말이 명사일 일이 거의 없다.
 */
function endsWithFutureEnding(word: string): boolean {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code < 11172 && code % 28 === 8;
}

export function readName(text: string): string | null {
  return readNameWithAction(text).name;
}

export function readNameWithAction(text: string): { name: string | null; sawAction: boolean } {
  let s = stripCadence(text);

  /**
   * 앞으로의 다짐 — "빨거야", "할 거야", "하려고". 이름이 아니다.
   *
   * 띄어 쓴 "할 거야" 를 먼저 지운다. 일반 규칙이 "거야" 만 떼면 "할" 이 홀로 남아
   * 이름에 섞인다. 실제로 "나 화장실 청소 했고 할" 이 되어 나왔다.
   */
  s = s.replace(/할\s*(?:래|거|게)\s*[가-힣]*/g, ' ');
  s = s.replace(/하려고[가-힣]*|할\s*생각[가-힣]*/g, ' ');
  s = s.replace(/앞으로|이제부터|다음부터/g, ' ');
  s = s.replace(/([가-힣]+)?\s*(?:거|게)\s*야/g, (_m, word?: string) =>
    word && endsWithFutureEnding(word) ? ' ' : word ? ` ${word} ` : ' ',
  );

  s = s.replace(DONE_MARKERS, ' ');
  s = s.replace(FIRST_PERSON, ' ');
  s = s.replace(TIME_EXPR, ' ');
  s = s.replace(QUERY_EXPR, ' ');
  /**
   * 한국어 발화에 섞여 들어온 소문자 로마자는 음성 인식 잡음으로 본다.
   * 대문자(TV, LED)는 실제 제품 이름일 수 있으므로 남긴다.
   */
  s = s.replace(/(?:^|\s)[a-z]{2,}(?=\s|$)/g, ' ');
  s = s.replace(/[?？!！.,·]/g, ' ');

  // 행동을 명사로 바꾼다. 문장에서는 지우고 끝에 붙인다.
  let action: string | null = null;
  for (const [pattern, noun] of actionNouns()) {
    const m = s.match(pattern);
    if (m) {
      action = noun;
      s = s.replace(pattern, ' ');
      break;
    }
  }

  // 남은 조사와 서술어를 턴다.
  s = s.replace(/\s+/g, ' ').trim();
  /**
   * 앞에 남은 조사를 턴다. 뒤에 아무것도 없을 때도 턴다.
   *
   * "지난주에 다림질 했어" 는 시간 표현과 행동을 지우고 나면 "에" 만 남는다.
   * 공백이 따라붙을 때만 지우면 그 "에" 가 이름에 붙어 "에 다림질" 이 된다.
   */
  s = s.replace(/^(?:에|을|를|은|는|이|가|도|의)(?:\s+|$)/, '');
  s = s.replace(/\s+(?:에|을|를|은|는|이|가|도|의)$/, '');
  s = s.replace(/(?:했음|했어요|했습니다|했어도|했고|했어|했다|했지|한다|함|해써|했)$/, '').trim();
  s = s.replace(/\s+/g, ' ').trim();

  /**
   * 완료 표지("했어", "함")가 있으면 사전에 없는 동사("설치")도 남은 말을 이름으로 본다.
   * "음 그거" 처럼 완료가 없는 잔여는 계속 불신한다.
   */
  const sawAction = action !== null || (Boolean(s) && hasCompletedMarker(text));
  if (!s && !action) return { name: null, sawAction };
  if (!action) return { name: s || null, sawAction };
  return { name: s ? `${s} ${action}` : action, sawAction };
}

/* ─────────────────────────── 실험용 덧씌우기 ─────────────────────────── */

/**
 * 규칙 표를 코드 수정 없이 바꿔 보는 입구. 온디바이스 실험실만 부른다.
 * 아무것도 넣지 않으면 위 표를 그대로 쓴다 — 앱·API 동작은 바뀌지 않는다.
 *
 * 추가한 패턴은 기존 표보다 먼저 본다. disabled 는 기존 표의 번호(0부터)다.
 */
export type RuleTableName = 'incomplete' | 'planned' | 'uncertain' | 'completed' | 'query';

export interface RuleOverrides {
  add?: Partial<Record<RuleTableName, string[]>> & { actionNouns?: Array<[string, string]> };
  disabled?: Partial<Record<RuleTableName | 'actionNouns', number[]>>;
}

const BASE_TABLES: Record<RuleTableName, RegExp[]> = {
  incomplete: INCOMPLETE,
  planned: PLANNED,
  uncertain: UNCERTAIN,
  completed: COMPLETED,
  query: QUERY,
};

let active: { tables: Record<RuleTableName, RegExp[]>; actionNouns: Array<[RegExp, string]> } | null =
  null;

function rules(name: RuleTableName): RegExp[] {
  return active ? active.tables[name] : BASE_TABLES[name];
}

function actionNouns(): Array<[RegExp, string]> {
  return active ? active.actionNouns : ACTION_NOUNS;
}

/** 잘못된 정규식이 있으면 던진다. null 을 넣으면 원래 표로 돌아간다. */
export function setRuleOverrides(overrides: RuleOverrides | null): void {
  if (!overrides) {
    active = null;
    return;
  }
  const off = (name: RuleTableName | 'actionNouns') => new Set(overrides.disabled?.[name] ?? []);
  const tables = {} as Record<RuleTableName, RegExp[]>;
  for (const name of Object.keys(BASE_TABLES) as RuleTableName[]) {
    const disabled = off(name);
    tables[name] = [
      ...(overrides.add?.[name] ?? []).map((source) => new RegExp(source)),
      ...BASE_TABLES[name].filter((_, i) => !disabled.has(i)),
    ];
  }
  const nounsOff = off('actionNouns');
  active = {
    tables,
    actionNouns: [
      ...(overrides.add?.actionNouns ?? []).map(
        ([source, noun]) => [new RegExp(source), noun] as [RegExp, string],
      ),
      ...ACTION_NOUNS.filter((_, i) => !nounsOff.has(i)),
    ],
  };
}

/** 원래 규칙 표. 실험실이 보여 주고 내려받는 용도. */
export function getRuleTables(): Record<RuleTableName, string[]> & {
  actionNouns: Array<[string, string]>;
} {
  const out = {} as Record<RuleTableName, string[]>;
  for (const name of Object.keys(BASE_TABLES) as RuleTableName[]) {
    out[name] = BASE_TABLES[name].map((pattern) => pattern.source);
  }
  return { ...out, actionNouns: ACTION_NOUNS.map(([pattern, noun]) => [pattern.source, noun]) };
}

/* ─────────────────────────── 한 번에 ─────────────────────────── */

export function readUtterance(text: string, reference: Date): UtteranceFacts {
  const { daysAgo, saw } = readDaysAgo(text, reference);
  const { name, sawAction } = readNameWithAction(text);
  const save = classifySave(text);

  return {
    intent: save.intent,
    willSave: save.willSave,
    daysAgo,
    statedCadenceDays: readCadenceDays(text),
    name,
    sawDate: saw,
    sawAction,
  };
}
