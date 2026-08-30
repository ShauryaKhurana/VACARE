import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Node 22+'s native experimental localStorage global shadows jsdom's own
// Storage implementation, so window.localStorage.setItem/getItem/removeItem
// silently aren't functions under jsdom unless it's disabled -- see the
// `NODE_OPTIONS=--no-experimental-webstorage` prefix on the `test` npm
// script. Not something to fix here; documented for whoever next wonders
// why a plain jsdom localStorage call throws.

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "."),
    },
  },
});
