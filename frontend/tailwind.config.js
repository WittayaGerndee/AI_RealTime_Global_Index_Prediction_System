/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0B0E14',
          800: '#151922',
          700: '#1F2430',
          600: '#2A3142',
        },
        brand: {
          blue: '#3B82F6',
          green: '#10B981',
          red: '#EF4444',
          yellow: '#F59E0B',
          purple: '#8B5CF6',
          cyan: '#06B6D4',
        }
      }
    },
  },
  plugins: [],
}
