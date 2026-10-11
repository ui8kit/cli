#!/usr/bin/env node
/**
 * End-to-end check of the BUILT CLI (dist/index.js) against a generated, synthetic static registry.
 * Covers: runtime filter keeps *.types.ts + imported helpers, utils/lib resolved via registryDependencies,
 * `paths` / `--path` precedence with registry targets, quiet type-only cycles. Two runtimes: svelte, react.
 *
 *   npm run build && node scripts/e2e-fixture-registry.mjs      (or: npm run test:e2e)
 *
 * No network, no npm installs (fixture items declare no npm dependencies). Uses a temp HOME for the CLI cache.
 */
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { buildFixtureRegistry } from "../tests/fixtures/build-fixture-registry.mjs"
import { serveDir } from "../tests/helpers/static-server.mjs"
import { findUnresolvedImports } from "../tests/helpers/check-imports.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const cli = process.env.UI8KIT_CLI || path.join(root, "dist", "index.js")
assert.ok(fs.existsSync(cli), "dist/index.js missing: run `npm run build` first")

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ui8kit-e2e-"))
const registryDir = path.join(tmp, "registry")
buildFixtureRegistry(registryDir)
const server = await serveDir(registryDir)

let failures = 0
function check(name, fn) {
  try {
    fn()
    console.log(`  ok   ${name}`)
  } catch (error) {
    failures += 1
    console.log(`  FAIL ${name}\n       ${String(error.message).split("\n").join("\n       ")}`)
  }
}

// Async on purpose: the static server lives in this process and must keep serving while the CLI runs.
function run(cwd, args) {
  const home = path.join(tmp, "home")
  fs.mkdirSync(home, { recursive: true })
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd,
      env: { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: "1" },
    })
    let out = ""
    child.stdout.on("data", (d) => (out += d))
    child.stderr.on("data", (d) => (out += d))
    const timer = setTimeout(() => child.kill("SIGKILL"), 120_000)
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ code, out })
    })
  })
}

function project(name) {
  const dir = path.join(tmp, name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, private: true }))
  return dir
}

const exists = (dir, rel) => fs.existsSync(path.join(dir, rel))

for (const rt of ["svelte", "react"]) {
  const ext = rt === "react" ? "tsx" : "svelte"
  const regUrl = `${server.url}/${rt}`
  const common = ["--registry-url", regUrl, "--strict-cdn"]
  console.log(`\n[${rt}]`)

  // 1) init with --runtime (no `--framework none` workaround), then add three items
  {
    const dir = project(`${rt}-three`)
    const init = await run(dir, ["init", "--yes", "--framework", rt, "--runtime", rt, "--dir", "src", ...common])
    check("init --runtime succeeds", () => assert.equal(init.code, 0, init.out))
    const add = await run(dir, ["add", "button", "card", "hero-split", "--force", "--runtime", rt])
    check("add button card hero-split: exit 0, 0 failed", () => {
      assert.equal(add.code, 0, add.out)
      assert.match(add.out, /Failed: 0/)
    })
    check("no 'not found' and no cycle warnings", () => {
      assert.doesNotMatch(add.out, /Component \S+ not found/i)
      assert.doesNotMatch(add.out, /cycle|circular/i)
    })
    check("*.types.ts and imported helper survive the runtime filter", () => {
      assert.ok(exists(dir, "src/blocks/hero-split.types.ts"))
      assert.ok(exists(dir, "src/blocks/feature-grid.types.ts"))
      assert.ok(exists(dir, "src/components/section-frame.types.ts"))
      assert.ok(exists(dir, "src/primitives/button/button.helpers.ts"))
      assert.ok(exists(dir, `src/blocks/hero-split.${ext}`))
    })
    check("0 unresolved relative imports", () => {
      const r = findUnresolvedImports(path.join(dir, "src"))
      assert.deepEqual(r.bad, [])
    })
  }

  // 2) init --skip-core: add must install utils and lib/presets itself
  {
    const dir = project(`${rt}-skipcore`)
    await run(dir, ["init", "--yes", "--framework", rt, "--runtime", rt, "--dir", "src", "--skip-core", ...common])
    check("init --skip-core leaves utils/presets absent", () => assert.ok(!exists(dir, "src/utils/cn.ts")))
    const add = await run(dir, ["add", "feature-grid"])
    check("add pulls registry:utils and registry:lib through registryDependencies", () => {
      assert.equal(add.code, 0, add.out)
      assert.ok(exists(dir, "src/utils/cn.ts"), "utils missing")
      assert.ok(exists(dir, "src/presets/defaults.ts"), "presets missing")
      assert.doesNotMatch(add.out, /Component \S+ not found/i)
    })
    // existing user-edited utils must not be overwritten, even with --force
    fs.writeFileSync(path.join(dir, "src/utils/cn.ts"), "// mine\n")
    await run(dir, ["add", "card", "--force"])
    check("pulled-in utils are not overwritten (even with --force)", () => {
      assert.equal(fs.readFileSync(path.join(dir, "src/utils/cn.ts"), "utf8"), "// mine\n")
    })
  }

  // 3) type-only cycles: quiet by default, listed with --verbose, each item installed once
  {
    const dir = project(`${rt}-cycles`)
    await run(dir, ["init", "--yes", "--framework", rt, "--runtime", rt, "--dir", "src", ...common])
    const quiet = await run(dir, ["add", "feature-grid", "section-frame", "--force"])
    check("cycles: no warning by default", () => assert.doesNotMatch(quiet.out, /cycle|circular|^! /im))
    const loud = await run(dir, ["--verbose", "add", "feature-grid", "section-frame", "--force"])
    check("cycles: type-only edges reported at --verbose", () => {
      assert.match(loud.out, /type-only dependency edge: feature-cards -> feature-grid/)
      assert.match(loud.out, /type-only dependency edge: section-header -> section-frame/)
    })
    check("each item installed once", () => {
      const names = [...quiet.out.matchAll(/^√ \[\d+\/\d+\] Installing ([\w-]+) from/gm)].map((m) => m[1])
      assert.equal(new Set(names).size, names.length, names.join(","))
    })
  }

  // 4) add --all
  {
    const dir = project(`${rt}-all`)
    await run(dir, ["init", "--yes", "--framework", rt, "--runtime", rt, "--dir", "src", ...common])
    const all = await run(dir, ["add", "--all", "--runtime", rt])
    check("add --all: 0 failed, no warnings about utils/lib", () => {
      assert.equal(all.code, 0, all.out)
      assert.match(all.out, /Failed: 0/)
      assert.doesNotMatch(all.out, /Component \S+ not found|cycle|circular/i)
    })
    check("add --all: 0 unresolved imports", () => assert.deepEqual(findUnresolvedImports(path.join(dir, "src")).bad, []))
  }

  // 5) paths precedence: CLI flag > config.paths (by target prefix) > target
  {
    const dir = project(`${rt}-paths`)
    await run(dir, ["init", "--yes", "--framework", rt, "--runtime", rt, "--dir", "src", "--skip-core", ...common])
    const cfgPath = path.join(dir, "ui8kit.config.json")
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"))
    cfg.paths = { ui: "kit" }
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2))
    const add = await run(dir, ["add", "card", "badge", "--force"])
    check("config.paths remaps registry targets (custom + canonical prefix)", () => {
      assert.equal(add.code, 0, add.out)
      assert.ok(exists(dir, `src/kit/card/card.${ext}`), "primitives/ target not remapped")
      assert.ok(exists(dir, `src/kit/badge/badge.${ext}`), "components/ui target not remapped")
      assert.ok(!exists(dir, "src/primitives"))
    })
    const flag = await run(dir, ["add", "card", "--force", "--path", "ui=flagged"])
    check("--path flag beats config.paths", () => {
      assert.equal(flag.code, 0, flag.out)
      assert.ok(exists(dir, `src/flagged/card/card.${ext}`))
    })
    const bad = await run(dir, ["add", "card", "--path", "nope=x"])
    check("--path with an unknown key fails with a clear message", () => {
      assert.notEqual(bad.code, 0)
      assert.match(bad.out, /Unknown --path key/)
    })
  }

  // 6) no paths configured: targets win (backward compatible)
  {
    const dir = project(`${rt}-plain`)
    await run(dir, ["init", "--yes", "--framework", rt, "--runtime", rt, "--dir", "src", "--skip-core", ...common])
    await run(dir, ["add", "card", "badge", "--force"])
    check("without paths the file target is used as before", () => {
      assert.ok(exists(dir, `src/primitives/card/card.${ext}`))
      assert.ok(exists(dir, `src/components/ui/badge/badge.${ext}`))
    })
  }
}

await server.close()
fs.rmSync(tmp, { recursive: true, force: true })
console.log(failures ? `\n${failures} check(s) failed` : "\nall e2e checks passed")
process.exit(failures ? 1 : 0)
