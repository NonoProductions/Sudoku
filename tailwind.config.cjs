
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
        gridTemplateRows: {
            '9': 'repeat(9, minmax(0, 1fr))',
        },
        gridTemplateColumns: {
            '9': 'repeat(9, minmax(0, 1fr))',
        }
    },
  },
  plugins: [],
}

