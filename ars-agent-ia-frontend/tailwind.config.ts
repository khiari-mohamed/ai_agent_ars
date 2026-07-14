import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ARS Institutional palette (navy repurposed to ARS red)
        navy: {
          50:  '#fff1f1',
          100: '#ffe0df',
          200: '#ffbdbb',
          300: '#ff9997',
          400: '#ff6f6b',
          500: '#d62121',
          600: '#b51a1a',
          700: '#8f1717',
          800: '#6d1212',
          900: '#4a0d0d',
          950: '#2a0808',
        },
        sage: {
          50:  '#f4f7f4',
          100: '#e2ece1',
          200: '#c4d9c2',
          300: '#96bb94',
          400: '#619d5e',
          500: '#3e7e3b',
          600: '#2d652a',
          700: '#245122',
          800: '#1d401b',
          900: '#163316',
        },
        amber: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        // Neutral graphite scale — used for dark UI surfaces/structure so the
        // brand red stays an accent instead of tinting every background (added
        // for the LoginPage redesign; safe to reuse anywhere else that needs a
        // true dark neutral rather than the red-tinted "navy" scale).
        ink: {
          50:  '#f6f7f9',
          100: '#eceef1',
          200: '#d3d7de',
          300: '#a8afba',
          400: '#7c8494',
          500: '#57606f',
          600: '#3a4150',
          700: '#262c38',
          800: '#171b23',
          900: '#0f1218',
          950: '#0a0c11',
        },
        // Semantic tokens
        surface: {
          base:    '#ffffff',
          raised:  '#f8fafc',
          overlay: '#f1f5f9',
          border:  '#e2e8f0',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
        arabic: [
          'Noto Sans Arabic',
          'Tahoma',
          'Arial',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        // Display serif — used sparingly for headlines/wordmarks on
        // high-stakes screens (login, auth). Not a body/UI face.
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      boxShadow: {
        'card':   '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.08)',
        'card-md':'0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.07)',
        'card-lg':'0 10px 15px -3px rgb(0 0 0 / 0.07), 0 4px 6px -4px rgb(0 0 0 / 0.07)',
        'widget': '0 20px 60px -10px rgb(34 6 6 / 0.25)',
        'focus':  '0 0 0 3px rgb(214 33 33 / 0.22)',
      },
      animation: {
        'pulse-slow':   'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow':    'spin-slow 8s linear infinite',
        'slide-up':     'slideUp 0.25s ease-out',
        'slide-down':   'slideDown 0.25s ease-out',
        'fade-in':      'fadeIn 0.2s ease-out',
        'typing-dot':   'typingDot 1.4s infinite ease-in-out',
        'sentiment-bar':'sentimentBar 1s ease-out forwards',
      },
      keyframes: {
        slideUp: {
          '0%':   { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',   opacity: '1' },
        },
        slideDown: {
          '0%':   { transform: 'translateY(-8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        typingDot: {
          '0%, 80%, 100%': { transform: 'scale(0)', opacity: '0.5' },
          '40%':           { transform: 'scale(1)', opacity: '1'   },
        },
        sentimentBar: {
          '0%':   { width: '0%' },
          '100%': { width: 'var(--sentiment-width)' },
        },
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;