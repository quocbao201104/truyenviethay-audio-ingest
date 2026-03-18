const { env } = require("../config/env");
const { RedisQueue } = require("../queue/redisQueue");

const main = async () => {
  if (!env.redisUrl) {
    throw new Error("REDIS_URL is required");
  }

  const queue = new RedisQueue("process");
  const stats = await queue.getStats();
  console.log(JSON.stringify(stats, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
