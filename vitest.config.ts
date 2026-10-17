import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)))

export default defineConfig({
  root,
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
    clearMocks: true,
    setupFiles: ["tests/helpers/isolate-home.ts"],
  },
})
