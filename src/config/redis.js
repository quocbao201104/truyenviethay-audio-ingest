const Redis = require("ioredis");
const { env } = require("./env");

const parseRedisUrl = (connectionString) => {
  const parsed = new URL(connectionString);

  if (!["redis:", "rediss:"].includes(parsed.protocol)) {
    throw new Error(`Unsupported Redis protocol: ${parsed.protocol}`);
  }

  const dbPath = parsed.pathname.replace(/^\//, "");

  return {
    host: parsed.hostname || "127.0.0.1",
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: dbPath ? Number(dbPath) : 0,
    ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
  };
};

const createRedisClient = ({ blocking = false } = {}) =>
  new Redis(parseRedisUrl(env.redisUrl), {
    maxRetriesPerRequest: 1,
    ...(blocking || env.redisCommandTimeoutMs <= 0
      ? {}
      : { commandTimeout: env.redisCommandTimeoutMs }),
    enableOfflineQueue: true,
    lazyConnect: false,
    keepAlive: 30000,
    retryStrategy: (times) => Math.min(times * 50, 2000),
  });

module.exports = {
  createRedisClient,
};
