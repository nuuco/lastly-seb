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

export interface UtteranceFacts {
  intent: Intent;
  /** 기준일로부터 며칠 전인지. 시간 표현이 없으면 0. */
  daysAgo: number;
  /** 문장에서 직접 말한 주기(일). 말하지 않았으면 null. */
  statedCadenceDays: number | null;
  /** 정규화한 항목 이름. 남는 말이 없으면 null. */
  name: string | null;
  /** 날짜·주기를 문장에서 실제로 읽어냈는지. 확신도를 매길 때 쓴다. */
  sawDate: boolean;
  /**
   * 아는 행동("빨았어", "닦았다")을 찾아냈는지.
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
export function readIntent(text: string): Intent {
  if (/\?|？/.test(text)) return 'query';
  if (/언제|얼마나|며칠|얼마만|몇\s*일|알려\s*줘|알려줄래/.test(text)) return 'query';
  // "간 지 됐어" 처럼 묻는 꼴
  if (/지\s*(얼마|몇)/.test(text)) return 'query';
  return 'record';
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
  // 좁은 것부터 본다. "빨래 널었어" 의 "빨래" 가 동사로 먹히면 안 된다.
  [/널(?:었|어|을|기)[가-힣]*/, '널기'],
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
  /(아침|점심|저녁|밤|새벽|오전|오후|오늘|어제|어저께|그저께|그제|방금|아까|막|마지막으로|(?:지난|저번|작)\s*주\s*[월화수목금토일]\s*요일|(?:지난|저번|작)\s*주|(?:지난|저번)\s*달|작년|[월화수목금토일]\s*요일|\d+\s*(?:일|주일|주|개월|달|년)\s*전|하루\s*전|이틀\s*전|사흘\s*전|나흘\s*전|열흘\s*전)/g;

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
  for (const [pattern, noun] of ACTION_NOUNS) {
    const m = s.match(pattern);
    if (m) {
      action = noun;
      s = s.replace(pattern, ' ');
      break;
    }
  }

  // 남은 조사와 서술어를 턴다.
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^(?:에|을|를|은|는|이|가|도|의)\s+/, '');
  s = s.replace(/\s+(?:에|을|를|은|는|이|가|도|의)$/, '');
  s = s.replace(/(?:했음|했어요|했어|했다|했지|한다|함|해써|했)$/, '').trim();
  s = s.replace(/\s+/g, ' ').trim();

  const sawAction = action !== null;
  if (!s && !action) return { name: null, sawAction };
  if (!action) return { name: s || null, sawAction };
  return { name: s ? `${s} ${action}` : action, sawAction };
}

/* ─────────────────────────── 한 번에 ─────────────────────────── */

export function readUtterance(text: string, reference: Date): UtteranceFacts {
  const { daysAgo, saw } = readDaysAgo(text, reference);
  const { name, sawAction } = readNameWithAction(text);

  return {
    intent: readIntent(text),
    daysAgo,
    statedCadenceDays: readCadenceDays(text),
    name,
    sawDate: saw,
    sawAction,
  };
}
