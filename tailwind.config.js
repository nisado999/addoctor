/** @type {import('tailwindcss').Config} */
export default {
  // index.html holds the static first screen, so its classes have to be generated too.
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      // The two fallbacks are Arial and Roboto resized to Inter Tight's metrics (styles.css), so the font swap does not move text.
      fontFamily: {
        sans: ['"Inter Tight"', '"Inter Tight Fallback"', '"Inter Tight Fallback Android"', "ui-sans-serif", "system-ui", "-apple-system", '"Segoe UI"', "sans-serif"],
        display: ['"Archivo"', '"Archivo Fallback"', '"Archivo Fallback Android"', '"Inter Tight"', "system-ui", "sans-serif"],
      },
      /* The whole app is drawn in two families: a warm stone neutral (under the name slate, so every screen and
         dialog picks it up) and one electric accent (under blue, close to the logo's blue but louder). */
      colors: {
        slate: { 50: "#faf9f7", 100: "#f3f1ed", 200: "#e7e4de", 300: "#d4d0c8", 400: "#a29d94", 500: "#6f6a62", 600: "#55514a", 700: "#3d3a35", 800: "#252320", 900: "#151412", 950: "#0b0a09" },
        blue: { 50: "#f1f5ff", 100: "#e3eaff", 200: "#cad7ff", 300: "#a7bdff", 400: "#7a9bff", 500: "#4d77ff", 600: "#2b59ff", 700: "#1f43e0", 800: "#1d37b0", 900: "#1c3289", 950: "#131e52" },
      },
    },
  },
  plugins: [],
};
