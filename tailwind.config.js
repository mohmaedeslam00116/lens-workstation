/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./workstation/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#111111',
        surface: '#191919',
        border: '#2a2a2a',
        muted: '#888888',
      },
      fontFamily: {
        sans: ['Inter', 'Cairo', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
