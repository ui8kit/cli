import { access, mkdir, readFile, writeFile, rm, readdir, stat } from "node:fs/promises"
import { constants, existsSync } from "node:fs"
import path from "node:path"

export async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export function pathExistsSync(target: string): boolean {
  return existsSync(target)
}

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true })
}

export async function readJson<T = unknown>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf-8")
  return JSON.parse(raw) as T
}

export async function writeJson(
  filePath: string,
  data: unknown,
  options: { spaces?: number } = {},
): Promise<void> {
  await ensureDir(path.dirname(filePath))
  const spaces = options.spaces ?? 2
  await writeFile(filePath, `${JSON.stringify(data, null, spaces)}\n`, "utf-8")
}

export async function remove(target: string): Promise<void> {
  await rm(target, { recursive: true, force: true })
}

export { readFile, writeFile, readdir, stat }
