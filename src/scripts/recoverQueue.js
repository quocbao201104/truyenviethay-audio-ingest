const logger = require("../config/logger");
const { env } = require("../config/env");
const { RedisQueue } = require("../queue/redisQueue");

const main = async () => {
  if (!env.redisUrl) {
    throw new Error("REDIS_URL is required");
  }

  const queue = new RedisQueue("process");
  const before = await queue.getStats();
  const recovered = await queue.recoverProcessingJobs();
  const after = await queue.getStats();

  logger.info(`Recovered ${recovered} job(s) from processing back to queue`, {
    before,
    after,
  });
};

main().catch((error) => {
  logger.error("Queue recovery failed", error);
  process.exitCode = 1;
});
