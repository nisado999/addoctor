/** @type {import('tailwindcss').Config} */
export default {
  // index.html holds the static first screen, so its classes have to be generated too.
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      // The two fallbacks are Arial and Roboto resized to Inter Tight's metrics (styles.css), so the font swap does not move text.
      // Tighter corners and calmer deep shadows than Tailwind's defaults: engineered, not bubbly.
      borderRadius: { "2xl": "0.75rem", "3xl": "0.875rem" },
      boxShadow: {
        xl: "0 1px 2px rgba(15, 23, 42, .04), 0 12px 28px -12px rgba(15, 23, 42, .16)",
        "2xl": "0 1px 2px rgba(15, 23, 42, .05), 0 20px 44px -16px rgba(15, 23, 42, .22)",
      },
      fontFamily: { sans: ['"Inter Tight"', '"Inter Tight Fallback"', '"Inter Tight Fallback Android"', "ui-sans-serif", "system-ui", "-apple-system", '"Segoe UI"', "sans-serif"] },
    },
  },
  plugins: [],
};
