/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      keyframes: {
        'voice-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(16, 185, 129, 0.28)' },
          '50%': { boxShadow: '0 0 0 12px rgba(16, 185, 129, 0)' }
        }
      },
      animation: {
        'voice-pulse': 'voice-pulse 1.3s ease-in-out infinite'
      }
    },
  },
  plugins: [],
}
