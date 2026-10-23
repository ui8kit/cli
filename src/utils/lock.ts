import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { getCliVersion } from "./cli-version.js"
import { toPosix } from "./paths.js"
import { RUNTIMES } from "./schema-config.js"

export const LOCK_FILE = "ui8kit.lock.json"
export const LOCK_VERSION = 2

export interface LockItem {
  name: string
  type: string
  /** Registry base URL the item was fetched from (e.g. `https://unpkg.com/@ui8kit/registry@3/r/react`). */
  source: string
  /** Exact registry version (item `digest`, else index `version`); `null` when unknown. Never a range. */
  version: string | null
  runtime?: string
  /** Installed path (posix, relative to the project root) → sha256 of the written content (LF line endings). */
  files: Record<string, string>
}

export interface LockFile {
  lockVersion: number
  cli: string
  items: Record<string, LockItem>
}

const VERSION_SEGMENT = /^v?\d+(?:\.\d+)*(?:-[0-9A-Za-z.-]+)?$/
const KNOWN_RUNTIMES = new Set<string>(RUNTIMES as readonly string[])

/** Strip `@version` from an npm package segment (`registry@3.0.0` → `registry`). */
function stripVersion(segment: string): string {
  const at = segment.lastIndexOf("@")
  return at > 0 ? segment.slice(0, at) : segment
}

/**
 * Registry identity of a source URL, independent of CDN host and version:
 *  - unpkg / jsDelivr npm URLs → `npm:<package>` (e.g. `npm:@ui8kit/registry`);
 *  - other hosts → `host/path` without version segments and without the runtime folder.
 * `runtime` is taken from the last path segment when it is a known runtime.
 */
export function registryIdentity(source: string): { identity: string; runtime?: string } {
  let url: URL
  try {
    url = new URL(source.trim())
  } catch {
    return { identity: toPosix(source.trim()).replace(/\/+$/, "") }
  }
  const host = url.host.toLowerCase()
  let segments = url.pathname.split("/").filter(Boolean)
  let runtime: string | undefined
  if (segments.length && KNOWN_RUNTIMES.has(segments[segments.length - 1]!)) runtime = segments.pop()

  let npmSegs: string[] | null = null
  if (host === "unpkg.com" || host === "www.unpkg.com") npmSegs = segments
  else if (host === "cdn.jsdelivr.net" && segments[0] === "npm") npmSegs = segments.slice(1)
  if (npmSegs && npmSegs.length) {
    const pkg = npmSegs[0]!.startsWith("@") && npmSegs[1] ? `${npmSegs[0]}/${stripVersion(npmSegs[1])}` : stripVersion(npmSegs[0]!)
    return { identity: `npm:${pkg}`, ...(runtime ? { runtime } : {}) }
  }
  segments = segments.map(stripVersion).filter((seg) => !VERSION_SEGMENT.test(seg))
  return { identity: [host, ...segments].join("/"), ...(runtime ? { runtime } : {}) }
}

/** Item key: `<registry identity>|<runtime>|<name>` (`-` when no runtime). Does not depend on CDN host or version. */
export function lockKey(source: string, name: string, runtime?: string): string {
  const id = registryIdentity(source)
  return `${id.identity}|${id.runtime ?? runtime ?? "-"}|${name}`
}

function compareVersions(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (!a) return -1
  if (!b) return 1
  const pa = a.split(/[.-]/), pb = b.split(/[.-]/)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i], y = pb[i]
    if (x === undefined) return 1 // 3.0.0 > 3.0.0-canary
    if (y === undefined) return -1
    const nx = Number(x), ny = Number(y)
    const c = Number.isNaN(nx) || Number.isNaN(ny) ? x.localeCompare(y) : nx - ny
    if (c !== 0) return c
  }
  return 0
}

/** Re-key items to lockVersion 2 keys; duplicates keep the newest version (later entry wins on ties). */
export function migrateLock(lock: LockFile): LockFile {
  const items: Record<string, LockItem> = {}
  for (const key of Object.keys(lock.items)) {
    const item = lock.items[key]!
    const k = lockKey(item.source, item.name, item.runtime)
    const prev = items[k]
    if (!prev || compareVersions(item.version ?? null, prev.version ?? null) >= 0) items[k] = item
  }
  return { lockVersion: LOCK_VERSION, cli: lock.cli, items }
}

/** sha256 hex of content with CRLF normalized to LF (git autocrlf on Windows must not look like an edit). */
export function hashContent(content: string): string {
  return createHash("sha256").update(content.replace(/\r\n/g, "\n"), "utf8").digest("hex")
}

/** Exact version only: `3.0.0`, `3.1.0-canary.1`. Ranges (`3`, `^3.1`) and dist-tags give `null`. */
export function exactVersion(...candidates: Array<unknown>): string | null {
  for (const c of candidates) {
    if (typeof c === "string" && /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(c.trim())) {
      return c.trim().replace(/^v/, "")
    }
  }
  return null
}

export function lockPath(cwd = process.cwd()): string {
  return path.resolve(cwd, LOCK_FILE)
}

export async function readLock(cwd = process.cwd()): Promise<LockFile | null> {
  try {
    const data = JSON.parse(await fs.readFile(lockPath(cwd), "utf-8")) as LockFile
    if (!data || typeof data !== "object" || typeof data.items !== "object") return null
    return data.lockVersion === LOCK_VERSION ? data : migrateLock(data)
  } catch {
    return null
  }
}

function sortObject<T>(obj: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]!]))
}

/** Deterministic serialization: sorted item keys, fixed field order, sorted file paths. */
export function serializeLock(lock: LockFile): string {
  const items: Record<string, LockItem> = {}
  for (const key of Object.keys(lock.items).sort()) {
    const it = lock.items[key]!
    items[key] = {
      name: it.name,
      type: it.type,
      source: it.source,
      version: it.version ?? null,
      ...(it.runtime ? { runtime: it.runtime } : {}),
      files: sortObject(it.files),
    }
  }
  return JSON.stringify({ lockVersion: LOCK_VERSION, cli: lock.cli, items }, null, 2) + "\n"
}

export interface LockEntryInput {
  name: string
  type: string
  source: string
  version: string | null
  runtime?: string
  /** Installed path → content written (hashed here). */
  files: Array<{ rel: string; content: string }>
}

/**
 * Merge entries into the lock (file maps are merged per item; other fields are replaced) and write it.
 * No-op when there is nothing to record and no lock yet.
 */
export async function updateLock(entries: LockEntryInput[], cwd = process.cwd()): Promise<LockFile | null> {
  const recordable = entries.filter((e) => e.files.length > 0)
  const existing = await readLock(cwd)
  if (!existing && recordable.length === 0) return null
  const lock: LockFile = existing ?? { lockVersion: LOCK_VERSION, cli: getCliVersion(), items: {} }
  lock.cli = getCliVersion()
  for (const e of recordable) {
    const key = lockKey(e.source, e.name, e.runtime)
    const prev = lock.items[key]
    const files: Record<string, string> = { ...(prev?.files ?? {}) }
    for (const f of e.files) files[toPosix(f.rel)] = hashContent(f.content)
    lock.items[key] = {
      name: e.name,
      type: e.type,
      source: e.source.replace(/\/+$/, ""),
      version: e.version,
      ...(e.runtime ? { runtime: e.runtime } : {}),
      files,
    }
  }
  await fs.writeFile(lockPath(cwd), serializeLock(lock), "utf-8")
  return lock
}
