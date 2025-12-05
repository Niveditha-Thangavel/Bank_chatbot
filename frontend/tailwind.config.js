/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,jsx,js}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: '#2563EB', // chatgpt-like soft blue
        accent: '#22C1C3', // aqua accent
        surface: '#F3F4F6', // light gray background
        muted: '#9CA3AF',
        success: '#34D399',
        warning: '#FBBF24',
        danger: '#F87171',
      },
      borderRadius: {
        sm: '10px',
        md: '14px',
      },
      boxShadow: {
        soft: '0 40px 80px rgba(15,23,42,0.9)',
      },
      backdropBlur: {
        glass: '24px',
      },
    },
  },
  plugins: [],
}


