import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// VITE_API_URL is read at BUILD time (see .env.example). Locally the dev server proxies /api to port 8000.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: { "/api": "http://localhost:8000" } },
  test: { environment: "jsdom", setupFiles: "./src/test-setup.js", globals: true },
});
