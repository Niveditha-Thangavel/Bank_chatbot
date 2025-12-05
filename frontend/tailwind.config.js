/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,jsx,js}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Banking color palette - professional and trustworthy
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1', // Primary brand color - indigo
          600: '#4f46e5', // Main primary
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        navy: {
          50: '#f0f4f8',
          100: '#d9e2ec',
          200: '#bcccdc',
          300: '#9fb3c8',
          400: '#829ab1',
          500: '#627d98',
          600: '#486581',
          700: '#334e68', // Deep navy - trust & security
          800: '#243b53',
          900: '#102a43',
        },
        emerald: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669', // Success color - growth
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        gold: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706', // Premium accent
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        surface: '#FFFFFF',
        background: '#f8fafc',
        muted: '#64748b',
        success: '#059669',
        warning: '#d97706',
        danger: '#dc2626',
        info: '#2563eb',
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


