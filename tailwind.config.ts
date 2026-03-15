import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#060a10',
          800: '#0d1520',
          700: '#111c2d',
          600: '#1a2a40',
          500: '#1e3a5f',
        }
      }
    }
  },
  plugins: [],
}
export default config