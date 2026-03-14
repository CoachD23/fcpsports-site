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
        },
        gold: {
          DEFAULT: '#f5a623',
          light: '#f7b84a',
          dark: '#d4911e',
        },
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'cursive'],
        body: ['"DM Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
