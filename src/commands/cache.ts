import { clearCache, getCacheDir } from "../utils/cache.js"
import { CLI_MESSAGES } from "../utils/cli-messages.js"
import { logger } from "../utils/logger.js"
import { handleError } from "../utils/errors.js"

export async function cacheClearCommand() {
  try {
    await clearCache()
    logger.success(`${CLI_MESSAGES.success.cacheCleared} (${getCacheDir()})`)
  } catch (error) {
    handleError(error)
  }
}

