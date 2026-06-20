/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Dark dashboard palette.
        ink: {
          900: "#0b0f1a",
          800: "#111827",
          700: "#1a2236",
          600: "#232d44",
        },
        accent: {
          DEFAULT: "#6366f1",
          hover: "#818cf8",
        },
      },
    },
  },
  plugins: [],
};
