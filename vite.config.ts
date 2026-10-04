import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
  root: "src/frontend",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@/frontend": fileURLToPath(new URL("./src/frontend", import.meta.url)),
    },
  },
  build: { outDir: "../../dist", emptyOutDir: true },
  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1" },
});
