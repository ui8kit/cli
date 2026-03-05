import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { logger } from "../../src/utils/logger.js"

describe("logger verbosity", () => {
  const originalConsole = console.log

  beforeEach(() => {
    console.log = vi.fn()
  })

  afterEach(() => {
    console.log = originalConsole
    logger.setVerbose(false)
  })

  it("suppresses debug output when verbose is disabled", () => {
    logger.setVerbose(false)
    logger.debug("debug message")
    expect(console.log).not.toHaveBeenCalled()
  })

  it("outputs debug when verbose is enabled", () => {
    logger.setVerbose(true)
    logger.debug("debug message")
    expect(console.log).toHaveBeenCalled()
  })
})
