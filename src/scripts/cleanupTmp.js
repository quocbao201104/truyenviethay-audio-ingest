const fs = require("fs/promises");
const path = require("path");
const { env } = require("../config/env");
const logger = require("../config/logger");

const main = async () => {
  const tmpDir = env.audioTmpDir;
  const maxAgeMs = env.tmpCleanupMaxAgeHours * 60 * 60 * 1000;
  const cutoff = Date.now() - maxAgeMs;

  let removed = 0;
  const entries = await fs.readdir(tmpDir, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    const fullPath = path.join(tmpDir, entry.name);
    const stat = await fs.stat(fullPath).catch(() => null);
    if (!stat) {
      continue;
    }

    const lastTouched = Math.max(
      stat.mtimeMs || 0,
      stat.ctimeMs || 0,
      stat.birthtimeMs || 0
    );

    if (lastTouched >= cutoff) {
      continue;
    }

    await fs.rm(fullPath, { recursive: true, force: true });
    removed += 1;
    logger.info(`Removed stale tmp entry: ${fullPath}`);
  }

  logger.info(
    `Temporary cleanup completed: removed=${removed}, tmpDir=${tmpDir}, maxAgeHours=${env.tmpCleanupMaxAgeHours}`
  );
};

main().catch((error) => {
  logger.error("Temporary cleanup failed", error);
  process.exitCode = 1;
});
