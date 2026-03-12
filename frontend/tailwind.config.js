/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"M PLUS Rounded 1c"', 'sans-serif'],
        body: ['"Noto Sans JP"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        quiz: {
          bg: '#0f0f1a',
          surface: '#1a1a2e',
          card: '#16213e',
          accent: '#e94560',
          gold: '#f5c518',
          teal: '#00d2d3',
          purple: '#6c5ce7',
          green: '#00b894',
          text: '#eaeaea',
          muted: '#8892a4',
        },
      },
      animation: {
        'slide-up': 'slideUp 0.4s ease-out',
        'fade-in': 'fadeIn 0.5s ease-out',
        'pop': 'pop 0.3s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'count-up': 'countUp 0.6s ease-out',
        'confetti': 'confetti 1s ease-out forwards',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pop: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '70%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 5px rgba(233,69,96,0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(233,69,96,0.6)' },
        },
        countUp: {
          '0%': { transform: 'scale(1.5)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
