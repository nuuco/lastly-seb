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

        action: 'var(--lastly-action)',
        'action-pressed': 'var(--lastly-action-pressed)',
        // 카드 안 "오늘 했어요" — 꽉 찬 버튼이 아니라 옅게 깔린 면이다.
        'action-soft': 'var(--lastly-action-soft)',
        'action-soft-ink': 'var(--lastly-action-soft-ink)',

        'bar-track': 'var(--lastly-bar-track)',
        'bar-near': 'var(--lastly-bar-near)',
        'bar-far': 'var(--lastly-bar-far)',

        'dot-on': 'var(--lastly-dot-on)',
        'dot-off': 'var(--lastly-dot-off)',
        'dot-mute': 'var(--lastly-dot-mute)',

        'listen-edge': 'var(--lastly-listen-edge)',
        'ink-mute': 'var(--lastly-ink-mute)',
        'ink-faint': 'var(--lastly-ink-faint)',
        backdrop: 'var(--lastly-backdrop)',

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
        success: 'var(--lastly-accent-ink)',
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
        '20': '20px',
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
        t2: '-.02em',
        t3: '-.03em',
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
        btn: 'var(--lastly-r-btn)',
        pill: 'var(--lastly-r-pill)',
        soft: 'var(--lastly-r-soft)',
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
        input: 'var(--lastly-shadow-input)',
        'hero-card': 'var(--lastly-shadow-hero-card)',
        chip: 'var(--lastly-shadow-chip)',
        answer: 'var(--lastly-shadow-answer)',
      },

      backgroundImage: {
        // "오늘 챙길 것" 카드의 세로 그라디언트
        hero: 'linear-gradient(180deg, var(--lastly-card-hi-from), var(--lastly-card-hi-to))',
      },

      keyframes: {
        // 입력 커서 깜빡임.
        caret: { '50%': { opacity: '0' } },
        /**
         * 듣는 중인 입력 바가 숨쉬는 테두리 — 설계 07.
         * 일정한 맥박이 아니라 불규칙한 마디로 되어 있다. 말소리에 반응하는 것처럼
         * 보이게 하려는 것이므로 균등하게 다듬지 않는다.
         */
        glow: {
          '0%,100%': {
            boxShadow:
              '0 0 0 1.5px rgba(168,95,68,.5), 0 0 10px 1px rgba(168,95,68,.16), 0 12px 26px rgba(70,58,44,.08)',
            borderColor: '#E0BFA6',
          },
          '18%': {
            boxShadow:
              '0 0 0 2px rgba(168,95,68,.85), 0 0 26px 7px rgba(168,95,68,.30), 0 12px 26px rgba(70,58,44,.08)',
            borderColor: '#A85F44',
          },
          '34%': {
            boxShadow:
              '0 0 0 1.5px rgba(168,95,68,.55), 0 0 14px 2px rgba(168,95,68,.18), 0 12px 26px rgba(70,58,44,.08)',
            borderColor: '#D9A87F',
          },
          '52%': {
            boxShadow:
              '0 0 0 2.5px rgba(168,95,68,.95), 0 0 34px 10px rgba(168,95,68,.36), 0 12px 26px rgba(70,58,44,.08)',
            borderColor: '#A85F44',
          },
          '68%': {
            boxShadow:
              '0 0 0 1.5px rgba(168,95,68,.5), 0 0 12px 2px rgba(168,95,68,.16), 0 12px 26px rgba(70,58,44,.08)',
            borderColor: '#E0BFA6',
          },
          '84%': {
            boxShadow:
              '0 0 0 2px rgba(168,95,68,.8), 0 0 24px 6px rgba(168,95,68,.26), 0 12px 26px rgba(70,58,44,.08)',
            borderColor: '#C98A54',
          },
        },
        // 듣는 중을 알리는 점.
        halo: {
          '0%,100%': { opacity: '.5', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.25)' },
        },
        spin: { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        caret: 'caret 1s step-end infinite',
        glow: 'glow 2.4s ease-in-out infinite',
        halo: 'halo 1.1s ease-in-out infinite',
        spin: 'spin .8s linear infinite',
      },

      fontFamily: { sans: ['var(--lastly-font)'] },
    },
  },
  plugins: [],
};

export default config;
