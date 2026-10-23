import { logger } from "./logger.js"
import { Component } from "../registry/schema.js"
import { type RegistryType } from "../utils/schema-config.js"
import { extractRelativeImports, isTypeFile, resolveImportKey } from "./runtime-files.js"

/** `registryBase` is set for bare names scoped to the registry of an item fetched by URL. */
type GetComponentFn = (name: string, registryType: RegistryType, registryBase?: string) => Promise<Component | null>

export type EdgeKind = "type-only" | "value" | "unknown"

export interface DependencyEdge {
  from: string
  to: string
  kind: EdgeKind
}

export interface DependencyCycle {
  /** Item names in cycle order (first item is not repeated at the end). */
  members: string[]
  edges: DependencyEdge[]
  /** True when every edge is known to be a type-only import. */
  typeOnly: boolean
  /** True when every edge is a known value import (a real runtime import cycle). */
  allValue: boolean
}

/**
 * `utils/<x>` and `lib/<x>` are typed spellings of registry items `<x>`.
 * Resolver keys use the bare item name so every item is installed once.
 */
export function normalizeDependencyName(name: string): string {
  const lower = name.trim().toLowerCase()
  const m = lower.match(/^(?:lib|utils)\/(.+)$/)
  return m ? m[1]! : lower
}

function fileKey(file: { path: string; target?: string }): string {
  return (file.target || file.path || "").replace(/\\/g, "/").replace(/^\.\//, "")
}

/**
 * Classify the dependency edge `from → to` by reading the relative imports of
 * `from`'s files that land on files of `to`.
 *  - every such import is type-only (or targets a `*.types.ts` file) → "type-only"
 *  - at least one value import → "value"
 *  - no import points at `to` (e.g. package alias, or declared only) → "unknown"
 */
export function classifyEdge(from: Component, to: Component): EdgeKind {
  const toKeys = new Map<string, string>()
  for (const file of to.files) toKeys.set(fileKey(file), fileKey(file))
  const known = new Set(toKeys.keys())
  let seen = 0
  for (const file of from.files) {
    const key = fileKey(file)
    // Resolve against both `from`'s own files and `to`'s (same install root).
    const all = new Set([...known, ...from.files.map(fileKey)])
    for (const ref of extractRelativeImports(file.content ?? "")) {
      const resolved = resolveImportKey(key, ref.specifier, all)
      if (!resolved || !known.has(resolved)) continue
      seen += 1
      const typeOnly = ref.typeOnly || isTypeFile(resolved)
      if (!typeOnly) return "value"
    }
  }
  return seen > 0 ? "type-only" : "unknown"
}

function describeEdge(edge: DependencyEdge): string {
  return `${edge.from} -> ${edge.to}`
}

/**
 * Registry base of an item fetched by URL: the part before the canonical type
 * folder (`…/r/react/components/ui/button.json` → `…/r/react`). Falls back to
 * the URL's directory. Query string and hash are dropped.
 */
export function registryBaseFromUrl(url: string): string {
  const clean = url.trim().replace(/[?#].*$/, "")
  const m = clean.match(
    /^(.*?)\/(?:components\/ui|components\/variants|components|blocks|layouts|widgets|variants|utils|lib|rules)\/[^/]+\.json$/i,
  )
  if (m) return m[1]!
  return clean.replace(/\/[^/]*$/, "")
}

function isUrlLike(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}

export interface ResolvedRegistryTree {
  components: Component[]
  /** Requested names (as given) that could not be resolved. */
  missing: string[]
}

/**
 * Resolve requested items and their `registryDependencies` (depth-first,
 * topologically ordered, each item once).
 *
 * Addresses:
 *  - bare name (`button`, `utils/cn`): the active registry, or — when the
 *    dependent item was fetched by URL — that item's registry base;
 *  - URL (`https://…/r/react/components/ui/button.json`): fetched directly; its
 *    own bare-name deps resolve against its registry base (strict, no fallback).
 * Tree keys are `base|name` for base-scoped items, so a brand `button` and a
 * primitive `button` from another registry do not collapse into one.
 */
export async function resolveRegistryTreeDetailed(
  componentNames: string[],
  registryType: RegistryType,
  getComponent: GetComponentFn
): Promise<ResolvedRegistryTree> {
  const componentsByKey = new Map<string, Component>()
  const depKeysByKey = new Map<string, string[]>()
  const state = new Map<string, "visiting" | "done">()
  const visitStack: string[] = []
  const backEdges = new Set<string>()
  const cycleStacks: string[][] = []

  const keyFor = (name: string, base?: string): string => {
    if (isUrlLike(name)) return name.trim()
    const bare = normalizeDependencyName(name)
    return base ? `${base}|${bare}` : bare
  }

  const ensureComponent = async (name: string, base?: string): Promise<string | null> => {
    const key = keyFor(name, base)
    if (state.get(key) === "done") {
      return componentsByKey.has(key) ? key : null
    }

    if (state.get(key) === "visiting") {
      // Dependency cycle: not an error. Items are written once, file order does not matter.
      const at = visitStack.indexOf(key)
      if (at >= 0) {
        const from = visitStack[visitStack.length - 1]!
        backEdges.add(`${from}\u0000${key}`)
        cycleStacks.push(visitStack.slice(at))
      }
      return key
    }

    const url = isUrlLike(name)
    const component = url ? await getComponent(name.trim(), registryType) : await getComponent(name, registryType, base)
    if (!component) {
      logger.warn(`Component ${name} not found in ${base ?? registryType} registry, skipping`)
      state.set(key, "done")
      return null
    }

    componentsByKey.set(key, component)
    state.set(key, "visiting")
    visitStack.push(key)

    const childBase = url ? registryBaseFromUrl(name) : base
    const depKeys: string[] = []
    for (const dependency of component.registryDependencies ?? []) {
      const depKey = await ensureComponent(dependency, childBase)
      if (depKey && !depKeys.includes(depKey)) depKeys.push(depKey)
    }
    depKeysByKey.set(key, depKeys)

    visitStack.pop()
    state.set(key, "done")
    return key
  }

  const missing: string[] = []
  for (const name of componentNames) {
    if (!(await ensureComponent(name))) missing.push(name)
  }

  const graph = new Map<string, Set<string>>()
  const inDegree = new Map<string, number>()
  for (const key of componentsByKey.keys()) {
    graph.set(key, new Set())
    inDegree.set(key, 0)
  }

  for (const [from, depKeys] of depKeysByKey) {
    for (const to of depKeys) {
      if (!componentsByKey.has(to) || to === from) continue
      // Back edges (cycle closers) do not constrain the install order.
      if (backEdges.has(`${from}\u0000${to}`)) continue
      graph.get(to)!.add(from)
      inDegree.set(from, (inDegree.get(from) ?? 0) + 1)
    }
  }

  const queue: string[] = []
  inDegree.forEach((value, key) => {
    if (value === 0) queue.push(key)
  })

  const orderedKeys: string[] = []
  while (queue.length > 0) {
    const current = queue.shift()!
    orderedKeys.push(current)
    for (const next of graph.get(current) ?? []) {
      const degree = (inDegree.get(next) ?? 1) - 1
      inDegree.set(next, degree)
      if (degree === 0) queue.push(next)
    }
  }

  // Defensive: back edges are removed above, so this should not trigger.
  for (const key of componentsByKey.keys()) {
    if (!orderedKeys.includes(key)) orderedKeys.push(key)
  }

  if (cycleStacks.length > 0) {
    reportCycles(findCycles(cycleStacks, componentsByKey))
  }

  return { components: orderedKeys.map(key => componentsByKey.get(key)!), missing }
}

export async function resolveRegistryTree(
  componentNames: string[],
  registryType: RegistryType,
  getComponent: GetComponentFn
): Promise<Component[]> {
  return (await resolveRegistryTreeDetailed(componentNames, registryType, getComponent)).components
}

/** Build cycle descriptions (deduplicated) with classified edges. */
export function findCycles(
  stacks: string[][],
  componentsByName: ReadonlyMap<string, Component>,
): DependencyCycle[] {
  const seen = new Set<string>()
  const cycles: DependencyCycle[] = []
  for (const members of stacks) {
    const canonical = [...members].sort().join("\u0000")
    if (seen.has(canonical)) continue
    seen.add(canonical)

    const edges: DependencyEdge[] = []
    for (let i = 0; i < members.length; i += 1) {
      const from = members[i]!
      const to = members[(i + 1) % members.length]!
      const a = componentsByName.get(from)
      const b = componentsByName.get(to)
      edges.push({ from, to, kind: a && b ? classifyEdge(a, b) : "unknown" })
    }
    cycles.push({
      members,
      edges,
      typeOnly: edges.every(e => e.kind === "type-only"),
      allValue: edges.every(e => e.kind === "value"),
    })
  }
  return cycles
}

/**
 * Cycles are resolvable (each item is installed once, files are plain copies),
 * so they are never a default-level warning. Only a cycle made of value imports
 * on every edge gets a single concise warning; type-only edges are listed at
 * --verbose.
 */
function reportCycles(cycles: DependencyCycle[]): void {
  for (const cycle of cycles) {
    if (cycle.allValue) {
      logger.warn(
        `Runtime import cycle between ${cycle.members.join(", ")} (installed once; check for circular value imports)`,
      )
      continue
    }
    for (const edge of cycle.edges) {
      if (edge.kind === "type-only") {
        logger.verbose(`type-only dependency edge: ${describeEdge(edge)} (cycle ${cycle.members.join(" -> ")})`)
      }
    }
    logger.verbose(`dependency cycle (resolved, installed once): ${[...cycle.members, cycle.members[0]!].join(" -> ")}`)
  }
}
