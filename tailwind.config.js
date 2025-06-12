/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'eltron': {
          'primary': '#3B4A5C', // kolor z logo
          'secondary': '#E8A87C', // pomarańczowy z logo
          'accent': '#C59ACD', // fioletowy z logo
          'light': '#87CEEB', // niebieski z logo
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}