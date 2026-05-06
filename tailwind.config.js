/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './layouts/**/*.html',
    './content/**/*.md',
    './assets/js/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#0a1628',
          800: '#0d1f3c',
          900: '#060e1a',
          deep: '#060f22', // dark hero backgrounds (canonical replacement for #0a0d14)
        },
        gold: {
          DEFAULT: '#f5a623',
          light: '#f7b84a',
          dark: '#d4911e',
        },
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'Impact', '"Arial Narrow"', 'sans-serif'],
        body: ['"DM Sans"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
