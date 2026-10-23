import fs from "node:fs"
import path from "node:path"
import type { Component, Config } from "../registry/schema.js"
import { normalizeDir, resolveFileInstallPath, toPosix } from "./paths.js"

/** Server-template runtimes: toolchain deps are Go modules / Composer / pip, never npm. */
export const SERVER_RUNTIMES = ["templ", "latte", "twig", "jinja2"] as const
export type ServerRuntime = (typeof SERVER_RUNTIMES)[number]

export function isServerRuntime(value: string | undefined): value is ServerRuntime {
  return value !== undefined && (SERVER_RUNTIMES as readonly string[]).includes(value)
}

/** Import path baked into generated templ code (registry `utils` item `meta.go.importPath`). */
export const TEMPL_UTILS_IMPORT = "github.com/ui8kit/codegen/generated/templ/utils"

/** `module` directive of a go.mod file, or undefined. */
export function parseGoModulePath(goMod: string): string | undefined {
  const stripped = goMod.replace(/\r\n/g, "\n").replace(/\/\/.*$/gm, "")
  const m = stripped.match(/^\s*module\s+("?)([^\s"]+)\1\s*$/m)
  return m?.[2]
}

export function readGoModulePath(cwd = process.cwd()): string | undefined {
  try {
    return parseGoModulePath(fs.readFileSync(path.join(cwd, "go.mod"), "utf-8"))
  } catch {
    return undefined
  }
}

/** App-relative folder (posix) where the `utils` item lands, e.g. `internal/utils`. */
export function templUtilsDir(config: Config): string {
  const probe = "utils/utils.go"
  return path.posix.dirname(toPosix(resolveFileInstallPath({ path: probe, target: probe, content: "" } as any, "registry:utils", config)))
}

/** Go import path of the installed utils package: `<module>/<utils dir>`. */
export function templUtilsImport(modulePath: string, config: Config): string {
  return `${modulePath.replace(/\/+$/, "")}/${templUtilsDir(config)}`
}

export function isGoSourceFile(rel: string): boolean {
  return /\.(go|templ)$/i.test(rel)
}

/** Rewrite the quoted Go import `"<from>"` (and `"<from>/…"`) to `to`. */
export function rewriteGoImport(content: string, from: string, to: string): string {
  if (!from || from === to) return content
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return content.replace(new RegExp(`"${escaped}(/[^"]*)?"`, "g"), (_m, rest: string | undefined) => `"${to}${rest ?? ""}"`)
}

function itemImportPath(component: Component): string {
  const p = component.meta?.go?.importPath
  return typeof p === "string" && p ? p : TEMPL_UTILS_IMPORT
}

/**
 * Content transform for templ installs: point generated imports at the app's own utils package.
 * Without go.mod (or module directive) the content is left unchanged (see `toolchainHints`).
 */
export function transformTemplContent(content: string, component: Component, config: Config, cwd = process.cwd()): string {
  const mod = readGoModulePath(cwd)
  if (!mod) return content
  return rewriteGoImport(content, itemImportPath(component), templUtilsImport(mod, config))
}

export interface ToolchainHints {
  /** Shell commands to run manually (deduped, order of first appearance). */
  commands: string[]
  /** Extra notes / snippets (deduped). */
  notes: string[]
  warnings: string[]
}

function substituteDir(value: string, config: Config): string {
  const dir = normalizeDir(config.dir || "src")
  return toPosix(value.replace(/<dir>/g, dir)).replace(/\/{2,}/g, "/")
}

/**
 * Non-npm requirements of installed server-runtime items, read from item `meta`
 * (`meta.go.require`, `meta.composer.require` / `autoload`, `meta.python.requirements`).
 * Quoted with double quotes so the commands work in bash, zsh, PowerShell and cmd.
 */
export function collectToolchainHints(components: Component[], config: Config, cwd = process.cwd()): ToolchainHints {
  const commands: string[] = []
  const notes: string[] = []
  const warnings: string[] = []
  const add = (list: string[], v: string) => {
    if (!list.includes(v)) list.push(v)
  }
  let hasTempl = false
  for (const c of components) {
    const meta = (c.meta ?? {}) as Record<string, any>
    if (c.runtime === "templ" || meta.go) hasTempl = true
    for (const req of Array.isArray(meta.go?.require) ? meta.go.require : []) {
      if (typeof req === "string") add(commands, `go get ${req}`)
    }
    const composerReq = meta.composer?.require
    if (composerReq && typeof composerReq === "object") {
      for (const [pkg, constraint] of Object.entries(composerReq)) {
        if (pkg === "php" || pkg.startsWith("ext-")) {
          add(notes, `Requires ${pkg} ${constraint}`)
          continue
        }
        add(commands, `composer require "${pkg}:${constraint}"`)
      }
    }
    const psr4 = meta.composer?.autoload?.["psr-4"]
    if (psr4 && typeof psr4 === "object") {
      const mapped = Object.fromEntries(Object.entries(psr4).map(([ns, dir]) => [ns, substituteDir(String(dir), config)]))
      add(
        notes,
        `Add to composer.json, then run "composer dump-autoload":\n${JSON.stringify({ autoload: { "psr-4": mapped } }, null, 2)}`,
      )
    }
    for (const req of Array.isArray(meta.python?.requirements) ? meta.python.requirements : []) {
      if (typeof req === "string") add(commands, `pip install "${req}"`)
    }
  }
  if (hasTempl && !readGoModulePath(cwd)) {
    const utilsDir = templUtilsDir(config)
    add(
      warnings,
      `No go.mod (module directive) in ${cwd}: generated templ code still imports "${TEMPL_UTILS_IMPORT}".\n` +
        `   Fix: run "go mod init <module>" here and re-run "ui8kit add <items> --force",\n` +
        `   or replace "${TEMPL_UTILS_IMPORT}" with "<module>/${utilsDir}" in every *.templ / *.go file under ${normalizeDir(config.dir || "src")}/.`,
    )
  }
  return { commands, notes, warnings }
}

/** Print hints once (callers pass every component installed in this run). */
export function printToolchainHints(hints: ToolchainHints, log: { warn: (m: string) => void } = console as any): void {
  for (const w of hints.warnings) log.warn(w)
  if (hints.commands.length > 0) {
    console.log("\nToolchain dependencies (not installed automatically, run manually):")
    for (const cmd of hints.commands) console.log(`  ${cmd}`)
  }
  for (const n of hints.notes) console.log(`\n${n}`)
}
