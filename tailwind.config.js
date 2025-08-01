/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,css}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

module.exports = {
  theme: {
    extend: {
      keyframes: {
        expand: {
          '0%': { maxHeight: '0px', opacity: '0' },
          '100%': { maxHeight: '500px', opacity: '1' },
        },
        collapse: {
          '0%': { maxHeight: '500px', opacity: '1' },
          '100%': { maxHeight: '0px', opacity: '0' },
        },
      },
      animation: {
        expand: 'expand 0.4s ease-out forwards',
        collapse: 'collapse 0.3s ease-in forwards',
      },
    },
  },
}