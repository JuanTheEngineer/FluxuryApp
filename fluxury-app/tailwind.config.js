module.exports = {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0f172a',
          elevated: '#1e293b',
          overlay: '#334155',
        },
        accent: {
          DEFAULT: '#f59e0b',
          hover: '#d97706',
        }
      },
      fontFamily: {
        sans: ['Montserrat', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
