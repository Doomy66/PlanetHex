import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths, so dist/ works both from a web server and from the
  // app:// scheme the desktop shell serves it over. See electron/main.cjs.
  base: "./",
  server: { port: 5173 },
});
