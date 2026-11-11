/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#08080c', 900: '#0c0c12', 850: '#101018', 800: '#15151f', 700: '#1d1d29', 600: '#282836' },
        line: '#26263a',
        accent: { DEFAULT: '#7c5cff', soft: '#a78bfa', deep: '#5b3ee0' },
        cyan: '#22d3ee',
        amber: '#f5a524',
        rose: '#fb7185',
        mint: '#34d399',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 1px 0 rgba(255,255,255,0.04) inset, 0 20px 60px -30px rgba(0,0,0,0.9)',
        glow: '0 0 0 1px rgba(124,92,255,0.35), 0 12px 40px -12px rgba(124,92,255,0.55)',
      },
      keyframes: {
        'pulse-live': { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
        'fade-up': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: { 'pulse-live': 'pulse-live 1.6s ease-in-out infinite', 'fade-up': 'fade-up .25s ease-out both' },
    },
  },
  plugins: [],
};
