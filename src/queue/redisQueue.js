const { createRedisClient } = require("../config/redis");
const { env } = require("../config/env");

class RedisQueue {
  constructor(queueName) {
    this.queueKey = `${env.redisPrefix}:queue:${queueName}`;
    this.processingKey = `${env.redisPrefix}:processing:${queueName}`;
    this.deadKey = `${env.redisPrefix}:dead:${queueName}`;
    this.commandRedis = createRedisClient();
    this.blockingRedis = createRedisClient({ blocking: true });
  }

  async enqueue(payload) {
    await this.commandRedis.lpush(this.queueKey, JSON.stringify(payload));
  }

  async getStats() {
    const results = await this.commandRedis
      .multi()
      .llen(this.queueKey)
      .llen(this.processingKey)
      .llen(this.deadKey)
      .exec();

    return {
      queueKey: this.queueKey,
      processingKey: this.processingKey,
      deadKey: this.deadKey,
      queued: Number(results?.[0]?.[1] || 0),
      processing: Number(results?.[1]?.[1] || 0),
      dead: Number(results?.[2]?.[1] || 0),
    };
  }

  async recoverProcessingJobs() {
    const recoveredJobs = [];

    while (true) {
      const rawJob = await this.commandRedis.rpoplpush(this.processingKey, this.queueKey);
      if (!rawJob) {
        break;
      }

      recoveredJobs.push(rawJob);
    }

    return recoveredJobs.length;
  }

  async reserve(timeoutSeconds = env.workerPollSeconds) {
    const rawJob = await this.blockingRedis.brpoplpush(this.queueKey, this.processingKey, timeoutSeconds);
    if (!rawJob) {
      return null;
    }

    return {
      rawJob,
      payload: JSON.parse(rawJob),
    };
  }

  async ack(rawJob) {
    await this.commandRedis.lrem(this.processingKey, 1, rawJob);
  }

  async fail(rawJob, payload, error) {
    const attempts = Number(payload.attempts || 0) + 1;
    const retryable = payload.retryable !== false;
    const nextPayload = {
      ...payload,
      attempts,
      lastError: error.message,
      failedAt: new Date().toISOString(),
    };

    await this.commandRedis.lrem(this.processingKey, 1, rawJob);

    if (retryable && attempts < env.workerMaxRetries) {
      await this.commandRedis.lpush(this.queueKey, JSON.stringify(nextPayload));
      return { requeued: true, attempts };
    }

    await this.commandRedis.lpush(this.deadKey, JSON.stringify(nextPayload));
    return { requeued: false, attempts };
  }

  async close() {
    await Promise.allSettled([this.commandRedis.quit(), this.blockingRedis.quit()]);
  }
}

module.exports = {
  RedisQueue,
};
