import tailwindcss from 'tailwindcss'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#ffffff',
        foreground: '#18181b',
        card: { DEFAULT: '#ffffff', foreground: '#18181b' },
        primary: { DEFAULT: '#18181b', foreground: '#ffffff' },
        secondary: { DEFAULT: '#ffffff', foreground: '#18181b' },
        muted: { DEFAULT: '#fafafa', foreground: '#71717a' },
        accent: { DEFAULT: '#ea580c', foreground: '#ffffff' },
        destructive: '#dc2626',
        border: '#e4e4e7',
        input: '#e4e4e7',
        ring: '#ea580c',
      },
      borderRadius: {
        sm: '0.125rem',
        md: '0.1875rem',
        lg: '0.25rem',
      },
    },
  },
  plugins: [],
}
