import { logger } from "./logger.js"
import { Component } from "../registry/schema.js"
import { type RegistryType } from "../utils/schema-config.js"
import { extractRelativeImports, isTypeFile, resolveImportKey } from "./runtime-files.js"

type GetComponentFn = (name: string, registryType: RegistryType) => Promise<Component | null>

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

export async function resolveRegistryTree(
  componentNames: string[],
  registryType: RegistryType,
  getComponent: GetComponentFn
): Promise<Component[]> {
  const componentsByName = new Map<string, Component>()
  const state = new Map<string, "visiting" | "done">()
  const visitStack: string[] = []
  const backEdges = new Set<string>()
  const cycleStacks: string[][] = []

  const ensureComponent = async (name: string): Promise<Component | null> => {
    const key = normalizeDependencyName(name)
    if (state.get(key) === "done") {
      return componentsByName.get(key) ?? null
    }

    if (state.get(key) === "visiting") {
      // Dependency cycle: not an error. Items are written once, file order does not matter.
      const at = visitStack.indexOf(key)
      if (at >= 0) {
        const from = visitStack[visitStack.length - 1]!
        backEdges.add(`${from}\u0000${key}`)
        cycleStacks.push(visitStack.slice(at))
      }
      return componentsByName.get(key) ?? null
    }

    const component = await getComponent(name, registryType)
    if (!component) {
      logger.warn(`Component ${name} not found in ${registryType} registry, skipping`)
      state.set(key, "done")
      return null
    }

    componentsByName.set(key, component)
    state.set(key, "visiting")
    visitStack.push(key)

    for (const dependency of component.registryDependencies ?? []) {
      await ensureComponent(dependency)
    }

    visitStack.pop()
    state.set(key, "done")
    return component
  }

  for (const name of componentNames) {
    await ensureComponent(name)
  }

  const keyOf = (component: Component) => component.name.toLowerCase()
  const keyByNormalized = new Map<string, string>()
  for (const [k, component] of componentsByName) keyByNormalized.set(k, keyOf(component))

  const graph = new Map<string, Set<string>>()
  const inDegree = new Map<string, number>()
  for (const component of componentsByName.values()) {
    const name = keyOf(component)
    graph.set(name, new Set())
    inDegree.set(name, 0)
  }

  for (const [fromKey, component] of componentsByName) {
    const from = keyOf(component)
    const seenDeps = new Set<string>()
    for (const dep of component.registryDependencies ?? []) {
      const depKey = normalizeDependencyName(dep)
      const target = componentsByName.get(depKey)
      if (!target || seenDeps.has(depKey)) continue
      seenDeps.add(depKey)
      // Back edges (cycle closers) do not constrain the install order.
      if (backEdges.has(`${fromKey}\u0000${depKey}`)) continue
      const to = keyOf(target)
      if (to === from) continue
      graph.get(to)!.add(from)
      inDegree.set(from, (inDegree.get(from) ?? 0) + 1)
    }
  }

  const queue: string[] = []
  inDegree.forEach((value, name) => {
    if (value === 0) queue.push(name)
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
  for (const component of componentsByName.values()) {
    const key = keyOf(component)
    if (!orderedKeys.includes(key)) orderedKeys.push(key)
  }

  if (cycleStacks.length > 0) {
    reportCycles(findCycles(cycleStacks, componentsByName))
  }

  const byComponentName = new Map<string, Component>()
  for (const component of componentsByName.values()) byComponentName.set(keyOf(component), component)
  return orderedKeys
    .map(key => byComponentName.get(key))
    .filter((component): component is Component => Boolean(component))
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
