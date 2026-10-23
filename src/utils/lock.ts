import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { getCliVersion } from "./cli-version.js"
import { toPosix } from "./paths.js"

export const LOCK_FILE = "ui8kit.lock.json"
export const LOCK_VERSION = 1

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

/** Item key: `base|name`. */
export function lockKey(source: string, name: string): string {
  return `${source.replace(/\/+$/, "")}|${name}`
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
    return data
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
    const key = lockKey(e.source, e.name)
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
