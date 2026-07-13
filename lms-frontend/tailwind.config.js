// Add/replace inside tailwind.config.js -> theme.extend.colors
// This is the "primary" (teal) + "accent" (gold) palette used across
// AdminDashboard, ManageUsers, Navbar, Sidebar, ProtectedRoute.
// Role colors (green = Student, red = Admin badge, existing accent = Teacher)
// are left as Tailwind defaults on purpose — they carry meaning and
// shouldn't compete with the brand palette.

module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // បន្ថែមបន្ទាត់នេះដើម្បីឲ្យ Tailwind ស្កេនរក class ក្នុង file React របស់អ្នក
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#EFF7F4',
          100: '#D7ECE4',
          200: '#AFD9CA',
          300: '#7FC0AC',
          400: '#4AA189',
          500: '#2A8571',
          600: '#1D6C5B', // main brand color
          700: '#175748',
          800: '#12433A',
          900: '#0D332D',
        },
        accent: {
          50:  '#FBF4E4',
          100: '#F5E4BE',
          200: '#EBCB85',
          300: '#DFB157',
          400: '#D19C35',
          500: '#C08526', // gold highlight
          600: '#9E6C1D',
          700: '#7C5417',
          800: '#5F4012',
        },
      },
    },
  },
};