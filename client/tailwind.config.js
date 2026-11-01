/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#FFFDF6',
        surface: '#FFFFFF',
        charcoal: '#343330',
        strong: '#1B1B1B',
        muted: '#616161',
        primary: {
          DEFAULT: '#32A749',
          hover: '#2B9140',
          deep: '#1F7A33',
          soft: '#4AB95A',
        },
        dark: '#191A23',
        limesoft: '#DDEB9D',
        lime: '#F6FF7C',
        bluechip: '#DAEFF8',
        peach: '#FFEDD5',
        borderc: '#ECE8DC',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        serif: ['Newsreader', 'Georgia', 'serif'],
        hand: ['"Shadows Into Light"', 'cursive'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
