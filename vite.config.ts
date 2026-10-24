import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

/**
 * The version, out of package.json and into the build.
 *
 * One number reaches the user - the one the Windows installer names itself
 * after - and the application has to be able to say it, on the landing page and
 * in a bug report. Read here rather than imported, so the shipped bundle carries
 * the string and not the whole of package.json.
 */
const version = JSON.parse(readFileSync("package.json", "utf8")).version as string;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  // Relative asset paths, so dist/ serves from a subdirectory as readily as
  // from a root and needs nothing configured to do it.
  base: "./",
  server: { port: 5173 },
});
