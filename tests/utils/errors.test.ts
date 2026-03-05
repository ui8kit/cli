import { describe, it, expect } from "vitest"
import { z } from "zod"
import { RegistryNotFoundError, ConfigNotFoundError, isZodError } from "../../src/utils/errors.js"

describe("typed error utilities", () => {
  it("creates registry not found error with suggestion", () => {
    const error = new RegistryNotFoundError("button", "ui")
    expect(error.message).toBe(`Component "button" was not found in ui registry.`)
    expect(error.suggestion).toBe("Run \"npx ui8kit@latest add --all --registry ui\"")
  })

  it("creates config not found error with suggestion", () => {
    const error = new ConfigNotFoundError("ui")
    expect(error.message).toBe(`ui8kit config not found for registry "ui".`)
    expect(error.suggestion).toBe("Run: npx ui8kit@latest init --registry ui")
  })

  it("detects zod errors", () => {
    const schema = z.object({ name: z.string() })
    let caught: unknown = null
    try {
      schema.parse({})
    } catch (error) {
      caught = error
    }

    expect(isZodError(caught)).toBe(true)
  })
})
