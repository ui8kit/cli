import { logger } from "./logger.js"
import { Component } from "../registry/schema.js"
import { type RegistryType } from "../utils/schema-config.js"

type GetComponentFn = (name: string, registryType: RegistryType) => Promise<Component | null>

export async function resolveRegistryTree(
  componentNames: string[],
  registryType: RegistryType,
  getComponent: GetComponentFn
): Promise<Component[]> {
  const componentsByName = new Map<string, Component>()
  const state = new Map<string, "visiting" | "done">()
  const visitStack: string[] = []

  const normalized = componentNames.map(name => name.toLowerCase())

  const ensureComponent = async (name: string): Promise<Component | null> => {
    const key = name.toLowerCase()
    if (state.get(key) === "done") {
      return componentsByName.get(key) ?? null
    }

    if (state.get(key) === "visiting") {
      const cycle = visitStack.includes(key)
        ? [...visitStack, key].join(" -> ")
        : key
      logger.warn(`Circular registry dependency detected: ${cycle}`)
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

  for (const name of normalized) {
    await ensureComponent(name)
  }

  const graph = new Map<string, Set<string>>()
  const inDegree = new Map<string, number>()

  for (const component of componentsByName.values()) {
    const name = component.name.toLowerCase()
    if (!graph.has(name)) {
      graph.set(name, new Set())
      inDegree.set(name, 0)
    }
  }

  for (const component of componentsByName.values()) {
    const from = component.name.toLowerCase()
    const deps = component.registryDependencies ?? []
    for (const dep of deps) {
      const to = dep.toLowerCase()
      if (!componentsByName.has(to)) {
        continue
      }

      const targets = graph.get(to)
      if (targets) {
        targets.add(from)
      } else {
        graph.set(to, new Set([from]))
      }

      inDegree.set(from, (inDegree.get(from) ?? 0) + 1)
    }
  }

  const queue: string[] = []
  inDegree.forEach((value, name) => {
    if (value === 0) {
      queue.push(name)
    }
  })

  const orderedKeys: string[] = []
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue

    orderedKeys.push(current)
    const targets = graph.get(current) || new Set()
    for (const next of targets) {
      const degree = (inDegree.get(next) ?? 1) - 1
      inDegree.set(next, degree)
      if (degree === 0) {
        queue.push(next)
      }
    }
  }

  // Fall back to stable insertion order for any remaining cyclic nodes.
  for (const key of componentsByName.keys()) {
    if (!orderedKeys.includes(key)) {
      logger.warn(`Unresolved dependency cycle detected for ${key}, appending in current order`)
      orderedKeys.push(key)
    }
  }

  return orderedKeys
    .map(key => componentsByName.get(key))
    .filter((component): component is Component => Boolean(component))
}
