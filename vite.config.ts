import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
const proxy = {
  "/api": {
    target: process.env.CIVIC_API_TARGET ?? "http://127.0.0.1:8000",
    changeOrigin: true,
  },
};
export default defineConfig({
  root: "src/frontend",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@/frontend": fileURLToPath(new URL("./src/frontend", import.meta.url)),
    },
  },
  build: { outDir: "../../dist", emptyOutDir: true },
  server: { host: "127.0.0.1", proxy },
  preview: { host: "127.0.0.1", proxy },
});
