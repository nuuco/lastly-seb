import type { Config } from 'tailwindcss';

/**
 * 색상은 packages/design-tokens의 CSS 변수를 참조한다. 값을 여기 복제하지 않는다.
 * 크기·자간은 설계가 소수점과 음수 자간을 쓰므로 그대로 등록한다 —
 * 이 둘이 디자인의 인상을 만들기 때문에 Tailwind 기본 스케일로 반올림하면 다른 화면이 된다.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--lastly-paper)',
        card: 'var(--lastly-card)',
        line: 'var(--lastly-line)',
        'line-2': 'var(--lastly-line-2)',
        rule: 'var(--lastly-rule)',

        ink: 'var(--lastly-ink)',
        'ink-2': 'var(--lastly-ink-2)',
        'ink-3': 'var(--lastly-ink-3)',

        accent: 'var(--lastly-accent)',
        'accent-soft': 'var(--lastly-accent-soft)',
        'accent-ink': 'var(--lastly-accent-ink)',

        sage: 'var(--lastly-sage)',
        'sage-soft': 'var(--lastly-sage-soft)',
        'sage-ink': 'var(--lastly-sage-ink)',

        action: 'var(--lastly-action)',
        'action-pressed': 'var(--lastly-action-pressed)',
        'dot-warn': 'var(--lastly-dot-warn)',

        'bar-track': 'var(--lastly-bar-track)',
        'bar-near': 'var(--lastly-bar-near)',
        'bar-far': 'var(--lastly-bar-far)',
        'wave-1': 'var(--lastly-wave-1)',
        'wave-2': 'var(--lastly-wave-2)',
        'wave-3': 'var(--lastly-wave-3)',

        danger: 'var(--lastly-danger)',

        // 구 이름 별칭 — 값은 설계 토큰을 가리킨다.
        bg: 'var(--lastly-paper)',
        surface: 'var(--lastly-card)',
        'surface-alt': 'var(--lastly-surface-alt)',
        'surface-sunken': 'var(--lastly-surface-sunken)',
        'line-strong': 'var(--lastly-rule)',
        'line-muted': 'var(--lastly-line-2)',
        'ink-secondary': 'var(--lastly-ink-2)',
        'ink-muted': 'var(--lastly-ink-3)',
        'ink-disabled': 'var(--lastly-ink-4)',
        success: 'var(--lastly-sage-ink)',
        warning: 'var(--lastly-accent-ink)',
        'warning-soft': 'var(--lastly-accent-soft)',
      },

      fontSize: {
        '11': '11px',
        '12': '12px',
        '12.5': '12.5px',
        '13': '13px',
        '13.5': '13.5px',
        '14': '14px',
        '15': '15px',
        '15.5': '15.5px',
        '16': '16px',
        '17': '17px',
        '19': '19px',
        '21': '21px',
        '23': '23px',
        '26': '26px',
        '30': '30px',
        '34': '34px',
      },

      letterSpacing: {
        wide2: '.02em',
        wide4: '.04em',
        t1: '-.01em',
        t25: '-.025em',
        t35: '-.035em',
        t4: '-.04em',
        t55: '-.055em',
      },

      borderRadius: {
        // 설계가 쓰는 곡률대에 맞춘 일반 스케일
        sm: '10px',
        md: '16px',
        lg: '20px',
        xl: '26px',
        row: 'var(--lastly-r-row)',
        card: 'var(--lastly-r-card)',
        hero: 'var(--lastly-r-hero)',
        phone: 'var(--lastly-r-phone)',
        sheet: 'var(--lastly-r-sheet)',
      },

      boxShadow: {
        hero: 'var(--lastly-shadow-hero)',
        card: 'var(--lastly-shadow-card)',
        action: 'var(--lastly-shadow-action)',
        'action-lg': 'var(--lastly-shadow-action-lg)',
        dock: 'var(--lastly-shadow-dock)',
        toast: 'var(--lastly-shadow-toast)',
        sheet: 'var(--lastly-shadow-sheet)',
        raise: 'var(--lastly-shadow-raise)',
        soft: 'var(--lastly-shadow-soft)',
        hair: 'var(--lastly-shadow-hair)',
        key: 'var(--lastly-shadow-key)',
        topline: 'var(--lastly-shadow-topline)',
        listen: 'var(--lastly-ring-listen)',
      },

      backgroundImage: {
        // "오늘 챙길 것" 카드의 세로 그라디언트
        hero: 'linear-gradient(180deg, var(--lastly-card-hi-from), var(--lastly-card-hi-to))',
      },

      keyframes: {
        // 음성 파형 막대 — 세로로 눌렸다 펴진다.
        wv: { from: { transform: 'scaleY(.3)' }, to: { transform: 'scaleY(1)' } },
        // 입력 커서 깜빡임.
        caret: { '50%': { opacity: '0' } },
      },
      animation: {
        wv: 'wv .8s ease-in-out infinite alternate',
        caret: 'caret 1s step-end infinite',
      },

      fontFamily: { sans: ['var(--lastly-font)'] },
    },
  },
  plugins: [],
};

export default config;
