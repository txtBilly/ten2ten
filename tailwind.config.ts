import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink:    '#1A1A18',   // near-black background, from the prototype
        paper:  '#F5F3EE',   // warm off-white
        gold:   '#C9A227',   // the bid CTA accent
        sage:   '#5B6B5A',   // trust / verified green
        muted:  '#8A887F',
      },
      fontFamily: {
        sans:    ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
export default config;
