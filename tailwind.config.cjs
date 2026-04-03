/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'selector',  // Require .dark class (never added) — prevents OS dark mode from activating Flowbite dark: styles
  content: ['./src/client/**/*.{svelte,ts,html}'],
  theme: {
    extend: {
      colors: {
        // Primary palette — centered so Flowbite's bg-primary-700 = our brand color.
        // Flowbite Button uses: 700 base, 800 hover, 300 focus-ring, 500 text.
        primary: {
          50:  '#fdf2f1',   // --primary-light
          100: '#fce4e2',
          200: '#f9ccc8',
          300: '#f4a8a0',   // focus rings
          400: '#ec7469',
          500: '#e04d3f',   // text accents
          600: '#c43a2d',
          700: '#A62F24',   // --primary  ← Flowbite selected-day bg
          800: '#731F17',   // --primary-hover  ← Flowbite selected-day hover
          900: '#4a1610',
        },
        danger: {
          500: '#F24C3D',
          600: '#d93829',
        },
        // Warm grays — replaces Tailwind's cool blue-gray with our design tokens.
        gray: {
          50:  '#fafaf8',   // --surface-alt
          100: '#f7f6f4',   // --bg
          200: '#e2e0dc',   // --border
          300: '#c5c2bc',   // --border-strong
          400: '#8c8a84',   // --text-muted
          500: '#57554f',   // --text-secondary
          600: '#3d3b37',
          700: '#2a2926',
          800: '#1c1b18',   // --text / --sidebar-bg
          900: '#0f0e0d',
        },
      },
    },
  },
  plugins: [],
};
