import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        card: 'hsl(var(--card) / <alpha-value>)',
        muted: 'hsl(var(--muted) / <alpha-value>)',
        'muted-foreground': 'hsl(var(--muted-foreground) / <alpha-value>)',
        border: 'hsl(var(--border) / <alpha-value>)',
        primary: 'hsl(var(--primary) / <alpha-value>)',
        'primary-foreground': 'hsl(var(--primary-foreground) / <alpha-value>)',
        accent: 'hsl(var(--accent) / <alpha-value>)',
        danger: 'hsl(var(--danger) / <alpha-value>)',
        warning: 'hsl(var(--warning) / <alpha-value>)',
        info: 'hsl(var(--info) / <alpha-value>)',
      },
      borderRadius: { xl: '1rem', '2xl': '1.35rem', '3xl': '1.85rem', '4xl': '2.25rem' },
      boxShadow: {
        soft: '0 10px 30px -14px hsl(var(--shadow) / 0.55)',
        glow: '0 10px 34px -10px hsl(var(--primary) / 0.65)',
        fab: '0 14px 34px -8px hsl(var(--primary) / 0.7), inset 0 1px 0 hsl(0 0% 100% / 0.35)',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'Suwannaphum', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      letterSpacing: { tightest: '-0.045em' },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        pop: { '0%': { transform: 'scale(.9)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
      },
      animation: { 'fade-up': 'fade-up .4s cubic-bezier(.2,.8,.2,1) both', pop: 'pop .2s ease-out both' },
    },
  },
  plugins: [animate],
} satisfies Config;
