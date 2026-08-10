import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  minify: false,
  target: "node20",
  tsconfig: "./tsconfig.json",
  splitting: false,
  sourcemap: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
})
