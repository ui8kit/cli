import fs from "node:fs/promises"
import path from "node:path"
import type { Config } from "../registry/schema.js"
import { getAllComponents, getComponentSource } from "../registry/api.js"
import { findConfig } from "../utils/project.js"
import { planItemFiles } from "../utils/install-plan.js"
import {
  LOCK_FILE,
  exactVersion,
  hashContent,
  readLock,
  updateLock,
  type LockEntryInput,
  type LockFile,
  registryIdentity,
} from "../utils/lock.js"
import { SCHEMA_CONFIG, getCdnUrls, type CdnResolutionOptions } from "../utils/schema-config.js"
import { logger } from "../utils/logger.js"

export interface CheckOptions {
  json?: boolean
  adopt?: boolean
  registryUrl?: string
  registryVersion?: string
  strictCdn?: boolean
  runtime?: string
  cache?: boolean
}

export type CheckCode = "no-lock" | "missing" | "modified" | "mixed-versions" | "rules-version" | "unknown-version" | "not-adopted"

export interface CheckIssue {
  level: "error" | "warning"
  code: CheckCode
  item?: string
  file?: string
  message: string
}

export interface CheckReport {
  ok: boolean
  lockFile: string
  items: number
  files: number
  errors: CheckIssue[]
  warnings: CheckIssue[]
  adopted?: { items: number; files: number }
}

const PRIMITIVE_TYPES = new Set(["registry:ui", "registry:utils"])

const MODIFIED_HINT =
  "edited locally, or installed with different aliases/importStyle/paths (import rewrites change the content)"

/** Offline verification of a lock against the files on disk. `readText` returns null for missing files. */
export async function analyzeLock(
  lock: LockFile,
  readText: (rel: string) => Promise<string | null>,
): Promise<Omit<CheckReport, "lockFile">> {
  const errors: CheckIssue[] = []
  const warnings: CheckIssue[] = []
  let files = 0

  const keys = Object.keys(lock.items).sort()
  for (const key of keys) {
    const item = lock.items[key]!
    if (!item.version) {
      warnings.push({ level: "warning", code: "unknown-version", item: key, message: `${item.name}: no exact registry version recorded` })
    }
    for (const rel of Object.keys(item.files).sort()) {
      files += 1
      const content = await readText(rel)
      if (content === null) {
        errors.push({ level: "error", code: "missing", item: key, file: rel, message: `${rel} is missing (${item.name})` })
      } else if (hashContent(content) !== item.files[rel]) {
        errors.push({ level: "error", code: "modified", item: key, file: rel, message: `${rel} differs from ${item.name}@${item.version ?? "?"}: ${MODIFIED_HINT}` })
      }
    }
  }

  // Mixed primitive versions from one source.
  const bySource = new Map<string, Map<string, string[]>>()
  for (const key of keys) {
    const item = lock.items[key]!
    if (!PRIMITIVE_TYPES.has(item.type) || !item.version) continue
    const id = registryIdentity(item.source).identity
    const versions = bySource.get(id) ?? new Map<string, string[]>()
    versions.set(item.version, [...(versions.get(item.version) ?? []), item.name])
    bySource.set(id, versions)
  }
  for (const [source, versions] of [...bySource].sort(([a], [b]) => a.localeCompare(b))) {
    if (versions.size < 2) continue
    const detail = [...versions].sort(([a], [b]) => a.localeCompare(b)).map(([v, names]) => `${v} (${names.sort().join(", ")})`).join("; ")
    errors.push({ level: "error", code: "mixed-versions", message: `Mixed primitive versions from ${source}: ${detail}. Re-run add --force for the outdated items` })
  }

  // Rules version vs primitives version (same source, else same runtime).
  for (const key of keys) {
    const rules = lock.items[key]!
    if (rules.type !== "registry:rules" || !rules.version) continue
    const prims = keys.map((k) => lock.items[k]!).filter((i) => PRIMITIVE_TYPES.has(i.type) && i.version)
    const rulesId = registryIdentity(rules.source).identity
    let peers = prims.filter((i) => registryIdentity(i.source).identity === rulesId)
    if (peers.length === 0) peers = prims.filter((i) => i.runtime === rules.runtime)
    const other = [...new Set(peers.map((i) => i.version!).filter((v) => v !== rules.version))].sort()
    if (other.length > 0) {
      errors.push({
        level: "error",
        code: "rules-version",
        item: key,
        message: `Agent rules ${rules.version} do not match primitives ${other.join(", ")}. Re-run init (or align the primitives)`,
      })
    }
  }

  return { ok: errors.length === 0, items: keys.length, files, errors, warnings }
}

function diskReader(cwd: string) {
  return async (rel: string): Promise<string | null> => {
    try {
      return await fs.readFile(path.resolve(cwd, rel), "utf-8")
    } catch {
      return null
    }
  }
}

/**
 * Build lock entries for an existing install: fetch every registry item, plan its files and
 * adopt only files whose disk content matches the expected content.
 */
export async function adoptInstalled(
  config: Config,
  options: CheckOptions,
  cwd = process.cwd(),
): Promise<{ entries: LockEntryInput[]; mismatches: CheckIssue[] }> {
  const runtime = options.runtime || config.runtime
  const cdn: CdnResolutionOptions = {
    registryUrl: options.registryUrl || config.registryUrl,
    registryVersion: options.registryVersion || config.registryVersion,
    strictCdn: options.strictCdn ?? config.strictCdn,
    cdnBaseUrls: config.cdnBaseUrls,
    runtime,
  }
  const registryType = SCHEMA_CONFIG.defaultRegistryType
  const components = await getAllComponents(registryType, { excludeTypes: [], noCache: options.cache === false, cdn })
  if (components.length === 0) throw new Error("Registry unreachable or empty: cannot adopt")
  const read = diskReader(cwd)
  const entries: LockEntryInput[] = []
  const mismatches: CheckIssue[] = []
  for (const component of components) {
    const matched: Array<{ rel: string; content: string }> = []
    for (const { rel, content } of planItemFiles(component, config, runtime)) {
      const disk = await read(rel)
      if (disk === null) continue
      if (hashContent(disk) === hashContent(content)) matched.push({ rel, content })
      else mismatches.push({ level: "warning", code: "not-adopted", item: component.name, file: rel, message: `${rel} differs from registry ${component.name}: not adopted` })
    }
    if (matched.length === 0) continue
    const source = getComponentSource(component)
    entries.push({
      name: component.name,
      type: component.type,
      source: source?.base ?? getCdnUrls(registryType, cdn)[0] ?? "unknown",
      version: exactVersion(component.digest, source?.indexVersion),
      runtime: component.runtime ?? runtime,
      files: matched,
    })
  }
  return { entries, mismatches }
}

export async function runCheck(options: CheckOptions = {}, cwd = process.cwd()): Promise<CheckReport> {
  const lockFile = path.resolve(cwd, LOCK_FILE)
  let adopted: CheckReport["adopted"]
  let extraWarnings: CheckIssue[] = []
  if (options.adopt) {
    const config = await findConfig(SCHEMA_CONFIG.defaultRegistryType)
    if (!config) throw new Error("ui8kit.config.json not found: run `ui8kit init` first")
    const { entries, mismatches } = await adoptInstalled(config, options, cwd)
    await updateLock(entries, cwd)
    adopted = { items: entries.length, files: entries.reduce((n, e) => n + e.files.length, 0) }
    extraWarnings = mismatches
  }
  const lock = await readLock(cwd)
  if (!lock) {
    return {
      ok: false,
      lockFile,
      items: 0,
      files: 0,
      errors: [{ level: "error", code: "no-lock", message: `${LOCK_FILE} not found: run \`ui8kit check --adopt\` (existing install) or \`ui8kit add\`` }],
      warnings: extraWarnings,
      ...(adopted ? { adopted } : {}),
    }
  }
  const report = await analyzeLock(lock, diskReader(cwd))
  return { ...report, lockFile, warnings: [...extraWarnings, ...report.warnings], ...(adopted ? { adopted } : {}) }
}

export async function checkCommand(options: CheckOptions = {}): Promise<void> {
  let report: CheckReport
  try {
    report = await runCheck(options)
  } catch (error) {
    if (options.json) console.log(JSON.stringify({ ok: false, error: (error as Error).message }, null, 2))
    else logger.error((error as Error).message)
    process.exit(1)
  }
  if (options.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    if (report.adopted) logger.info(`Adopted ${report.adopted.files} files from ${report.adopted.items} items into ${LOCK_FILE}`)
    for (const w of report.warnings) logger.warn(`${w.code}: ${w.message}`)
    for (const e of report.errors) logger.error(`${e.code}: ${e.message}`)
    if (report.ok) logger.success(`ui8kit check: ${report.items} items, ${report.files} files OK`)
    else logger.error(`ui8kit check: ${report.errors.length} error(s)`)
  }
  if (!report.ok) process.exit(1)
}
