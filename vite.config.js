import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// base "./" keeps asset paths relative, so the build works on any static host or sub-folder.
export default defineConfig({
  base: "./",
  plugins: [react()],
  // "@/..." points at src/, so components added with the shadcn CLI (React Bits registry) import as they are written.
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: {
    rollupOptions: {
      output: {
        // React changes rarely and the template list changes often: separate files let browsers keep the unchanged one.
        manualChunks(id) {
          // Only React goes in the always-loaded vendor file. Other libraries (the sign-in one is large) load when used.
          if (/[\/]node_modules[\/](react|react-dom|scheduler)[\/]/.test(id)) return "vendor";
          if (/[\/]src[\/](data\.jsx|templateImgs\.js)$/.test(id)) return "templates";
        },
      },
    },
  },
});
