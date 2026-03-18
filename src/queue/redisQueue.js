const redis = require("../config/redis");
const { env } = require("../config/env");

class RedisQueue {
  constructor(queueName) {
    this.queueKey = `${env.redisPrefix}:queue:${queueName}`;
    this.processingKey = `${env.redisPrefix}:processing:${queueName}`;
    this.deadKey = `${env.redisPrefix}:dead:${queueName}`;
  }

  async enqueue(payload) {
    await redis.lpush(this.queueKey, JSON.stringify(payload));
  }

  async getStats() {
    const results = await redis
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
      const rawJob = await redis.rpoplpush(this.processingKey, this.queueKey);
      if (!rawJob) {
        break;
      }

      recoveredJobs.push(rawJob);
    }

    return recoveredJobs.length;
  }

  async reserve(timeoutSeconds = env.workerPollSeconds) {
    const rawJob = await redis.brpoplpush(this.queueKey, this.processingKey, timeoutSeconds);
    if (!rawJob) {
      return null;
    }

    return {
      rawJob,
      payload: JSON.parse(rawJob),
    };
  }

  async ack(rawJob) {
    await redis.lrem(this.processingKey, 1, rawJob);
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

    await redis.lrem(this.processingKey, 1, rawJob);

    if (retryable && attempts < env.workerMaxRetries) {
      await redis.lpush(this.queueKey, JSON.stringify(nextPayload));
      return { requeued: true, attempts };
    }

    await redis.lpush(this.deadKey, JSON.stringify(nextPayload));
    return { requeued: false, attempts };
  }
}

module.exports = {
  RedisQueue,
};
