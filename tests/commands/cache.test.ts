import { describe, it, expect, vi } from "vitest"
import { cacheClearCommand } from "../../src/commands/cache.js"
import * as cache from "../../src/utils/cache.js"
import { logger } from "../../src/utils/logger.js"

describe("cache command", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("clears cache and prints summary", async () => {
    const clearSpy = vi.spyOn(cache, "clearCache").mockResolvedValue(undefined)
    const pathSpy = vi.spyOn(cache, "getCacheDir").mockReturnValue("/tmp/ui8kit-cache")
    const successSpy = vi.spyOn(logger, "success")

    await cacheClearCommand()

    expect(clearSpy).toHaveBeenCalled()
    expect(pathSpy).toHaveBeenCalled()
    expect(successSpy).toHaveBeenCalledWith(expect.stringContaining("/tmp/ui8kit-cache"))
  })
})
