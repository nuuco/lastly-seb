/**
 * docs/design-reference/ 에서 그대로 옮긴 값. tokens.css와 한 쌍으로 유지한다.
 *
 * 주의: `accent`는 웜 그레이(#4A433F)다. 주황은 `action`이며
 * 주 액션 버튼과 임박 배지에만 쓴다 — 전면에 깔면 설계와 완전히 달라진다.
 */
export const color = {
  accent: '#4A433F',
  accentSoft: '#F7EEDA',
  accentInk: '#8A5A12',

  sage: '#5A6347',
  sageSoft: '#E9EDE1',
  sageInk: '#4A5439',

  action: '#B0552F',
  actionPressed: '#9C4A26',

  ink: '#2D2622',
  ink2: '#5A534C',
  ink3: '#6E665D',

  paper: '#F5F2EC',
  card: '#FBF9F4',
  line: '#E6E0D4',
  line2: '#E4DCCB',
  rule: '#E1D9CB',

  cardHiFrom: '#F6F1E6',
  cardHiTo: '#FCFBF8',
  dotWarn: '#E09F3E',

  barTrack: '#EFEAE0',
  barNear: '#C68B59',
  barFar: '#5A6347',

  danger: '#B3402C',
} as const;

export const radius = {
  row: '18px',
  card: '24px',
  hero: '26px',
  phone: '46px',
} as const;

export const shadow = {
  hero: '0 10px 28px rgba(44,38,35,.10)',
  card: '0 4px 16px rgba(70,58,44,.04)',
  action: '0 8px 18px rgba(176,85,47,.26)',
} as const;

/**
 * 설계는 소수점 폰트 크기와 음수 자간을 쓴다.
 * 이 둘이 이 디자인의 인상을 만들므로 반올림하지 않는다.
 */
export const type = {
  headline: { size: '23px', weight: 700, tracking: '-.035em' },
  heroName: { size: '21px', weight: 700, tracking: '-.035em' },
  heroNumber: { size: '30px', weight: 700, tracking: '-.055em', leading: '1' },
  rowName: { size: '16px', weight: 600, tracking: '-.025em' },
  rowBadge: { size: '16px', weight: 700, tracking: '-.04em' },
  sectionLabel: { size: '13px', weight: 700, tracking: '-.01em' },
  eyebrow: { size: '12.5px', weight: 700, tracking: '.02em' },
  meta: { size: '12.5px', weight: 400 },
  caption: { size: '13px', weight: 400 },
  body: { size: '14px', weight: 600 },
  action: { size: '15.5px', weight: 600 },
} as const;

export const font = {
  family:
    "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
} as const;

/** 설계 기준 뷰포트 — 390 × 844 (iPhone 14). */
export const viewport = { width: 390, height: 844 } as const;
