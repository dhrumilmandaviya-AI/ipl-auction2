/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          deep: '#080c14',
          card: '#0e1420',
          elevated: '#141a2a',
          border: '#1e2a3a',
        },
        gold: {
          DEFAULT: '#f59e0b',
          bright: '#fbbf24',
          dim: '#92400e',
          glow: 'rgba(245,158,11,0.15)',
        },
        electric: {
          DEFAULT: '#3b82f6',
          bright: '#60a5fa',
          glow: 'rgba(59,130,246,0.2)',
        },
        sold: '#10b981',
        danger: '#ef4444',
        role: {
          bat: '#3b82f6',
          bwl: '#ef4444',
          ar: '#10b981',
          wk: '#8b5cf6',
        },
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'cursive'],
        mono: ['"DM Mono"', 'monospace'],
        body: ['"Outfit"', 'sans-serif'],
      },
      animation: {
        'ticker': 'ticker 40s linear infinite',
        'pulse-gold': 'pulseGold 1s ease-in-out infinite',
        'gavel': 'gavel 0.5s ease-out',
        'bid-flash': 'bidFlash 0.4s ease-out',
        'sold-pop': 'soldPop 0.6s cubic-bezier(0.34,1.56,0.64,1)',
        'countdown-pulse': 'countdownPulse 1s ease-in-out infinite',
      },
      keyframes: {
        ticker: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(-100%)' },
        },
        pulseGold: {
          '0%, 100%': { boxShadow: '0 0 15px rgba(245,158,11,0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(245,158,11,0.8)' },
        },
        gavel: {
          '0%': { transform: 'rotate(-30deg)' },
          '100%': { transform: 'rotate(0deg)' },
        },
        bidFlash: {
          '0%': { backgroundColor: 'rgba(245,158,11,0.4)' },
          '100%': { backgroundColor: 'transparent' },
        },
        soldPop: {
          '0%': { transform: 'scale(0.5)', opacity: 0 },
          '100%': { transform: 'scale(1)', opacity: 1 },
        },
        countdownPulse: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.5 },
        },
      },
      backgroundImage: {
        'pitch-texture': "repeating-linear-gradient(90deg, rgba(255,255,255,0.01) 0px, rgba(255,255,255,0.01) 1px, transparent 1px, transparent 60px), repeating-linear-gradient(0deg, rgba(255,255,255,0.01) 0px, rgba(255,255,255,0.01) 1px, transparent 1px, transparent 60px)",
        'gold-gradient': 'linear-gradient(135deg, #f59e0b, #fbbf24)',
        'card-gradient': 'linear-gradient(135deg, #0e1420, #141a2a)',
      },
    },
  },
  plugins: [],
}
