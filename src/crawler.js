const logger = require("./config/logger");
const { env } = require("./config/env");
const { runDiscoveryOnce } = require("./services/discoveryService");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runCycle = async () => {
  const startedAt = Date.now();
  if (!env.youtubeSourceUrl) {
    throw new Error("YOUTUBE_SOURCE_URL is required");
  }

  if (!env.redisUrl) {
    throw new Error("REDIS_URL is required");
  }

  const result = await runDiscoveryOnce();
  logger.info(
    `Discovery completed: playlists=${result.totalPlaylists}, videos=${result.totalVideos}, enqueued=${result.totalEnqueued}, durationMs=${Date.now() - startedAt}`
  );
};

const main = async () => {
  logger.info(
    `Crawler config: loop=${env.crawlerLoopEnabled}, intervalSeconds=${env.crawlerIntervalSeconds}, playlistLimit=${env.playlistLimit}`
  );

  if (env.crawlerStartupDelaySeconds > 0) {
    logger.info(`Crawler startup delay: sleeping ${env.crawlerStartupDelaySeconds}s before first cycle`);
    await sleep(env.crawlerStartupDelaySeconds * 1000);
  }

  if (!env.crawlerLoopEnabled) {
    await runCycle();
    return;
  }

  while (true) {
    try {
      await runCycle();
    } catch (error) {
      logger.error("Crawler cycle failed", error);
    }

    logger.info(`Crawler sleeping ${env.crawlerIntervalSeconds}s before next cycle`);
    await sleep(env.crawlerIntervalSeconds * 1000);
  }
};

main().catch((error) => {
  logger.error("Crawler failed", error);
  process.exitCode = 1;
});
