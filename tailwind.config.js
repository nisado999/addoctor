/** @type {import('tailwindcss').Config} */
export default {
  // index.html holds the static first screen, so its classes have to be generated too.
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      // The two fallbacks are Arial and Roboto resized to Inter Tight's metrics (styles.css), so the font swap does not move text.
      fontFamily: { sans: ['"Inter Tight"', '"Inter Tight Fallback"', '"Inter Tight Fallback Android"', "ui-sans-serif", "system-ui", "-apple-system", '"Segoe UI"', "sans-serif"] },
    },
  },
  plugins: [],
};
