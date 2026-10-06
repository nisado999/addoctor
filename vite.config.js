import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" keeps asset paths relative, so the build works on any static host or sub-folder.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // React changes rarely and the template list changes often: separate files let browsers keep the unchanged one.
        manualChunks(id) {
          if (id.includes("node_modules")) return "vendor";
          if (/[\/]src[\/](data\.jsx|templateImgs\.js)$/.test(id)) return "templates";
        },
      },
    },
  },
});
