const logger = require("./config/logger");
const { env } = require("./config/env");
const { RedisQueue } = require("./queue/redisQueue");
const { processVideoJob } = require("./services/processVideoService");

const processQueue = new RedisQueue("process");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const workerLoop = async (workerId, state) => {
  logger.info(`Worker ${workerId} is ready`);

  while (!state.shouldStop) {
    if (env.jobLimit > 0 && state.processedCount >= env.jobLimit) {
      state.shouldStop = true;
      break;
    }

    const reserved = await processQueue.reserve(env.workerPollSeconds);
    if (!reserved) {
      continue;
    }

    try {
      await processVideoJob(reserved.payload);
      await processQueue.ack(reserved.rawJob);
      state.processedCount += 1;
      logger.info(`Worker ${workerId} finished ${reserved.payload.youtubeVideoId}`);
    } catch (error) {
      const result = await processQueue.fail(reserved.rawJob, reserved.payload, error);
      state.processedCount += 1;
      logger.error(
        `Worker ${workerId} failed ${reserved.payload.youtubeVideoId} (requeued=${result.requeued}, attempts=${result.attempts})`,
        error.message
      );
    }

    if (env.downloadDelayMs > 0 && !state.shouldStop) {
      logger.info(`Worker ${workerId} sleeping ${env.downloadDelayMs}ms before next job`);
      await sleep(env.downloadDelayMs);
    }

    if (env.jobLimit > 0 && state.processedCount >= env.jobLimit) {
      state.shouldStop = true;
      logger.warn(`Worker reached JOB_LIMIT=${env.jobLimit}, stopping after current job`);
    }
  }
};

const main = async () => {
  if (!env.redisUrl) {
    throw new Error("REDIS_URL is required");
  }

  logger.info(
    `Worker config: concurrency=${env.workerConcurrency}, segmentSeconds=${env.segmentSeconds}, jobLimit=${env.jobLimit}, downloadDelayMs=${env.downloadDelayMs}, recoverProcessingOnStart=${env.recoverProcessingOnStart}`
  );

  if (env.recoverProcessingOnStart) {
    const recovered = await processQueue.recoverProcessingJobs();
    if (recovered > 0) {
      logger.warn(`Recovered ${recovered} job(s) from processing back to queue on startup`);
    }
  }

  const state = {
    processedCount: 0,
    shouldStop: false,
  };

  const loops = [];
  for (let i = 0; i < env.workerConcurrency; i += 1) {
    loops.push(workerLoop(i + 1, state));
  }

  await Promise.all(loops);
};

main().catch((error) => {
  logger.error("Worker process crashed", error);
  process.exitCode = 1;
});
