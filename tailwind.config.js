import colors from "tailwindcss/colors";
import plugin from "tailwindcss/plugin";

/* Dark mode: every themed colour is a CSS variable (light value in :root, dark value under .dark), so the 1,000+
   existing utility classes switch with the class on <html> and nothing else has to change. */
const trip = (hex) => { const n = parseInt(hex.slice(1), 16); return `${n >> 16} ${(n >> 8) & 255} ${n & 255}`; };
const vars = { light: {}, dark: {} };
const themed = (id, light, dark) => {
  vars.light[`--${id}`] = trip(light); vars.dark[`--${id}`] = trip(dark);
  return `rgb(var(--${id}) / <alpha-value>)`;
};
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const scale = (name, light, dark, bg) => Object.fromEntries(SHADES.map((n) => [n, themed(`${bg ? "b" : "c"}-${name}-${n}`, light[n], (bg && bg[n]) || dark[n])]));

const slateLight = { 50: "#faf9f7", 100: "#f3f1ed", 200: "#e7e4de", 300: "#d4d0c8", 400: "#a29d94", 500: "#6f6a62", 600: "#55514a", 700: "#3d3a35", 800: "#252320", 900: "#151412", 950: "#0b0a09" };
const slateDark = { 50: "#0b0a09", 100: "#151412", 200: "#262421", 300: "#3d3a35", 400: "#7d786f", 500: "#9a958c", 600: "#b5b0a6", 700: "#d4d0c8", 800: "#e7e4de", 900: "#f3f1ed", 950: "#faf9f7" };
// Backgrounds are themed on their own: the near-black buttons (bg-slate-950 with white text) stay dark and readable.
const slateBg = { 50: "#181715", 100: "#1f1d1b", 200: "#2a2825", 300: "#3d3a35", 400: "#55514a", 500: "#6f6a62", 600: "#55514a", 700: "#4a4640", 800: "#3d3a35", 900: "#34312c", 950: "#2c2a26" };
const blueLight = { 50: "#f1f5ff", 100: "#e3eaff", 200: "#cad7ff", 300: "#a7bdff", 400: "#7a9bff", 500: "#4d77ff", 600: "#2b59ff", 700: "#1f43e0", 800: "#1d37b0", 900: "#1c3289", 950: "#131e52" };
const blueDark = { 50: "#0f1838", 100: "#131e52", 200: "#1c3289", 300: "#1d37b0", 400: "#7a9bff", 500: "#6d8dff", 600: "#6b8cff", 700: "#8aa7ff", 800: "#a7bdff", 900: "#cad7ff", 950: "#e3eaff" };
const blueBg = { 50: "#0f1838", 100: "#131e52", 200: "#1c3289", 300: "#1d37b0", 400: "#7a9bff", 500: "#4d77ff", 600: "#2b59ff", 700: "#1f43e0", 800: "#1d37b0", 900: "#1c3289", 950: "#131e52" };
// Pale tints (rose-50, emerald-100 ...) become deep tints, and their dark text shades become light.
const flip = { 50: 950, 100: 900, 200: 800, 300: 700, 600: 400, 700: 300, 800: 200 };
const hue = (name) => Object.fromEntries(SHADES.map((n) => [n, themed(`c-${name}-${n}`, colors[name][n], colors[name][flip[n] || n])]));
const HUES = ["rose", "emerald", "amber", "violet", "indigo", "sky", "orange", "fuchsia", "red", "pink"];
const white = themed("b-white", "#ffffff", "#151412");

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
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
        slate: scale("slate", slateLight, slateDark),
        blue: scale("blue", blueLight, blueDark),
        ...Object.fromEntries(HUES.map((h) => [h, hue(h)])),
      },
      // bg-white follows the theme; text-white stays white.
      backgroundColor: { white, slate: scale("slate", slateLight, slateDark, slateBg), blue: scale("blue", blueLight, blueDark, blueBg) },
      gradientColorStops: { white },
      ringOffsetColor: { white },
    },
  },
  plugins: [plugin(({ addBase }) => addBase({ ":root": vars.light, ".dark": vars.dark }))],
};
