// Every test file gets its own HOME (and USERPROFILE), so the CLI cache (~/.ui8kit/cache) is never shared between test files
// running in parallel. Before: `build` clears the cache while another file writes it (ENOTEMPTY, flaky build/typed-deps tests).
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterAll } from "vitest"

const home = fs.mkdtempSync(path.join(os.tmpdir(), "ui8kit-test-home-"))
process.env.HOME = home
process.env.USERPROFILE = home
afterAll(() => fs.rmSync(home, { recursive: true, force: true }))
