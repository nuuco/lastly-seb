import { classifySave, readCadenceDays, readDaysAgo, readIntent, readName, readNameWithAction } from '@lastly/parser';

/**
 * 규칙 파서는 LLM 을 부르지 않고 끝낼 수 있는 문장을 가려내는 자리다.
 * 여기서 틀리면 사용자가 적은 날짜나 주기가 조용히 다른 값으로 저장된다.
 */

/** 2026-09-13 은 일요일. 요일 계산이 걸린 케이스의 기준일이다. */
const SUN = new Date(2026, 8, 13);

describe('주기 읽기', () => {
  it.each([
    ['오늘 이불 빨았어 한달에 한번 빨거야', 30],
    ['세탁조 청소했어 세달에 한번 할래', 90],
    ['에어컨 필터 청소함 45일마다 할거야', 45],
    ['2주마다 할래', 14],
    ['일주일에 한번씩 해', 7],
    ['이틀에 한번 물 줘야 해', 2],
    ['열흘마다 갈아', 10],
    ['매일 하는 거야', 1],
    ['격주로 할래', 14],
  ])('%s → %s일', (text, days) => {
    expect(readCadenceDays(text)).toBe(days);
  });

  it('언제 했는지를 주기로 읽지 않는다', () => {
    // "3일 전에 했어" 는 날짜다. 주기로 읽으면 3일마다 하는 일이 되어버린다.
    expect(readCadenceDays('3일 전에 정수기 필터 갈았어')).toBeNull();
    expect(readCadenceDays('오늘 이불 빨았어')).toBeNull();
  });

  it('터무니없는 주기는 버린다', () => {
    expect(readCadenceDays('3년마다 할래')).toBeNull();
  });
});

describe('날짜 읽기', () => {
  it.each([
    ['오늘 이불 빨았어', 0],
    ['어제 화분 물 줬어', 1],
    ['그저께 칫솔 갈았어', 2],
    ['그끄저께 청소했어', 3],
    ['그그제 청소했어', 3],
    ['3일 전에 정수기 필터 갈았어', 3],
    ['2주 전에 청소했어', 14],
    ['지난주에 했어', 7],
    ['지난달에 갈았어', 30],
    ['이틀 전에 했어', 2],
  ])('%s → %s일 전', (text, days) => {
    expect(readDaysAgo(text, SUN).daysAgo).toBe(days);
  });

  it('지난주 요일은 기준일에서 거슬러 센다', () => {
    // 기준일이 일요일이므로 "지난주 일요일" 은 딱 7일 전이다.
    expect(readDaysAgo('지난주 일요일에 욕실 배수구 청소했어', SUN).daysAgo).toBe(7);
    // 지난주 화요일은 그보다 닷새 더 앞이다.
    expect(readDaysAgo('지난주 화요일에 했어', SUN).daysAgo).toBe(12);
  });

  it('주기 표현의 숫자를 날짜로 읽지 않는다', () => {
    // "45일마다" 의 45 를 날짜로 읽으면 45일 전에 한 일이 되어버린다.
    expect(readDaysAgo('에어컨 필터 청소함 45일마다 할거야', SUN).daysAgo).toBe(0);
  });

  it('시간 표현이 없으면 오늘로 두고 그 사실을 알린다', () => {
    expect(readDaysAgo('이불 빨았어', SUN)).toEqual({ daysAgo: 0, saw: false });
    expect(readDaysAgo('오늘 이불 빨았어', SUN)).toEqual({ daysAgo: 0, saw: true });
  });
});

describe('의도 읽기', () => {
  it.each([
    ['마지막으로 이불 언제 빨았지?', 'query'],
    ['칫솔 간 지 얼마나 됐어?', 'query'],
    ['이불 언제 빨았더라', 'query'],
    ['오늘 이불 빨았어', 'record'],
    ['어제 화분 물 줬어', 'record'],
  ])('%s → %s', (text, intent) => {
    expect(readIntent(text)).toBe(intent);
  });
});

describe('이름 읽기', () => {
  it.each([
    ['오늘 이불 빨았어', '이불 빨래'],
    ['어제 화분 물 줬어', '화분 물 주기'],
    ['그저께 칫솔 갈았어', '칫솔 교체'],
    ['이불 세탁했어', '이불 빨래'],
    ['3일 전에 정수기 필터 갈았어', '정수기 필터 교체'],
    ['오늘 이불 빨았어 한달에 한번 빨거야', '이불 빨래'],
    ['세탁조 청소했어 세달에 한번 할래', '세탁조 청소'],
    ['마지막으로 이불 언제 빨았지?', '이불 빨래'],
  ])('%s → %s', (text, name) => {
    expect(readName(text)).toBe(name);
  });

  it('사전에 없는 대상도 사용자가 말한 그대로 살린다', () => {
    // 대상의 종류는 끝이 없다. 행동만 바꾸고 나머지는 건드리지 않는다.
    expect(readName('가습기 필터 갈았어')).toBe('가습기 필터 교체');
    expect(readName('블라인드 닦았어')).toBe('블라인드 청소');
  });
});

describe('그 자체가 행동인 말', () => {
  /**
   * "설거지", "분리수거" 처럼 명사 하나에 행동이 들어 있는 말들.
   *
   * 이것들이 사전에 없으면 이름은 맞게 나오는데 sawAction 이 서지 않아,
   * 규칙이 자기 답을 믿지 못하고 AI 로 넘긴다. 평가 문장 50개 중 10개가
   * 여기 걸려 있었다 — 더 볼 것도 없는 문장까지 LLM 을 부르고 있었다.
   */
  it.each([
    ['나 어제 설거지 했어', '설거지'],
    ['지난주에 다림질 했어', '다림질'],
    ['분리수거 했어', '분리수거'],
    ['차 세차했어', '차 세차'],
    ['오늘 아침에 환기 시켰어', '환기'],
    ['강아지 산책시켰어', '강아지 산책'],
    ['욕실 곰팡이 제거했어', '욕실 곰팡이 제거'],
    ['어항 물갈이 했어', '어항 물갈이'],
    ['화분 분갈이 했어', '화분 분갈이'],
    ['강아지 빗질했어', '강아지 빗질'],
    ['강아지 양치시켰어', '강아지 양치'],
  ])('%s → %s (행동을 알아본다)', (text, name) => {
    const got = readNameWithAction(text);
    expect(got.name).toBe(name);
    expect(got.sawAction).toBe(true);
  });
});

describe('사전에 없던 동사', () => {
  it.each([
    ['방금 이불 갰어', '이불 정리'],
    ['워셔액 넣었어', '워셔액 보충'],
    ['세제 채웠어', '세제 보충'],
    ['강아지 발톱 깎았어', '강아지 발톱 깎기'],
    ['오늘 가습기 필터 설치했어', '가습기 필터 설치'],
  ])('%s → %s', (text, name) => {
    const got = readNameWithAction(text);
    expect(got.name).toBe(name);
    expect(got.sawAction).toBe(true);
  });
});

describe('저장 여부', () => {
  it('완료 뒤에 할거야는 주기이지 예정이 아니다', () => {
    const save = classifySave('오늘 가습기 필터 설치했고 한달마다 할거야');
    expect(save.kind).toBe('completed');
    expect(save.willSave).toBe(true);
    expect(save.intent).toBe('record');
    expect(readCadenceDays('오늘 가습기 필터 설치했고 한달마다 할거야')).toBe(30);
  });

  it('할래도 완료가 있으면 저장한다', () => {
    const save = classifySave('세탁조 청소했어 세달에 한번 할래');
    expect(save.kind).toBe('completed');
    expect(save.willSave).toBe(true);
  });

  it('순수 예정은 저장하지 않는다', () => {
    const save = classifySave('내일 가습기 필터 설치할거야');
    expect(save.kind).toBe('planned');
    expect(save.willSave).toBe(false);
  });

  it('못 함은 저장하지 않는다', () => {
    const save = classifySave('오늘 이불 못 빨았어');
    expect(save.kind).toBe('incomplete');
    expect(save.willSave).toBe(false);
  });

  it('것 같아는 저장하지 않는다', () => {
    const save = classifySave('이불 빨았던 것 같아');
    expect(save.kind).toBe('uncertain');
    expect(save.willSave).toBe(false);
  });

  it('짧은 함도 완료다', () => {
    const save = classifySave('베란다 청소 오늘 함');
    expect(save.kind).toBe('completed');
    expect(save.willSave).toBe(true);
    expect(save.intent).toBe('record');
  });

  it('쯤은 시간 어림이지 불확실이 아니다', () => {
    const save = classifySave('세 시쯤 이불 빨았어');
    expect(save.willSave).toBe(true);
    expect(save.kind).toBe('completed');
  });

  it('그거야만으로는 예정이 아니다', () => {
    const save = classifySave('응 그거야');
    expect(save.kind).not.toBe('planned');
  });

  it('완료 표지 없는 잔여는 이름으로 믿지 않는다', () => {
    const got = readNameWithAction('오늘 점심 맛있었다');
    expect(got.sawAction).toBe(false);
  });
});
