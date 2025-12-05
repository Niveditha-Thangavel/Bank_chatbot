/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,jsx,js}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: '#3B82F6', // vibrant blue (Chase card style)
        accent: '#14B8A6', // teal/green (Citi card style)
        surface: '#FFFFFF', // clean white background
        muted: '#9CA3AF',
        success: '#10B981', // emerald green
        warning: '#F59E0B', // amber/orange
        danger: '#EF4444', // red
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


