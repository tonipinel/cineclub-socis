/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{astro,js}'],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#BF9000',
          dark: '#7F6000',
        },
      },
      fontFamily: {
        display: ['Oswald', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
