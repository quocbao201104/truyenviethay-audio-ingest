const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
};

const parseNumber = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  logLevel: process.env.LOG_LEVEL || "info",
  dryRun: parseBoolean(process.env.DRY_RUN, false),
  dbHost: process.env.DB_HOST || "127.0.0.1",
  dbPort: parseNumber(process.env.DB_PORT, 3306),
  dbUser: process.env.DB_USER || "",
  dbPassword: process.env.DB_PASSWORD || "",
  dbName: process.env.DB_NAME || "",
  redisUrl: process.env.REDIS_URL || "",
  redisPrefix: process.env.REDIS_PREFIX || "audio",
  redisCommandTimeoutMs: parseNumber(process.env.REDIS_COMMAND_TIMEOUT_MS, 0),
  r2Endpoint: process.env.R2_ENDPOINT || "",
  r2Region: process.env.R2_REGION || "auto",
  r2Bucket: process.env.R2_BUCKET || "",
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || "",
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  r2PublicBaseUrl: process.env.R2_PUBLIC_BASE_URL || "",
  r2KeyPrefix: process.env.R2_KEY_PREFIX || "audio",
  partnerId: parseNumber(process.env.PARTNER_ID, 0),
  partnerName: process.env.PARTNER_NAME || "partner",
  youtubeSourceUrl: process.env.YOUTUBE_SOURCE_URL || "",
  playlistLimit: parseNumber(process.env.PLAYLIST_LIMIT, 0),
  crawlerLoopEnabled: parseBoolean(process.env.CRAWLER_LOOP_ENABLED, false),
  crawlerIntervalSeconds: parseNumber(process.env.CRAWLER_INTERVAL_SECONDS, 600),
  crawlerStartupDelaySeconds: parseNumber(process.env.CRAWLER_STARTUP_DELAY_SECONDS, 0),
  systemUserId: parseNumber(process.env.SYSTEM_USER_ID, 13),
  enableStoryCreate: parseBoolean(process.env.ENABLE_STORY_CREATE, false),
  ytDlpBin: process.env.YTDLP_BIN || "yt-dlp",
  ytDlpJsRuntimes: process.env.YTDLP_JS_RUNTIMES || "node",
  ytDlpCookiesFile: process.env.YTDLP_COOKIES_FILE || "",
  ffmpegBin: process.env.FFMPEG_BIN || "ffmpeg",
  ffprobeBin: process.env.FFPROBE_BIN || "ffprobe",
  audioTmpDir: process.env.AUDIO_TMP_DIR || path.join(process.cwd(), "tmp"),
  segmentSeconds: parseNumber(process.env.SEGMENT_SECONDS, 600),
  workerPollSeconds: parseNumber(process.env.WORKER_POLL_SECONDS, 5),
  workerConcurrency: parseNumber(process.env.WORKER_CONCURRENCY, 1),
  workerMaxRetries: parseNumber(process.env.WORKER_MAX_RETRIES, 5),
  jobLimit: parseNumber(process.env.JOB_LIMIT, 0),
  downloadDelayMs: parseNumber(process.env.DOWNLOAD_DELAY_MS, 0),
  r2UploadConcurrency: parseNumber(process.env.R2_UPLOAD_CONCURRENCY, 3),
  tmpCleanupMaxAgeHours: parseNumber(process.env.TMP_CLEANUP_MAX_AGE_HOURS, 24),
  recoverProcessingOnStart: parseBoolean(process.env.RECOVER_PROCESSING_ON_START, true),
};

const ensureEnv = (keys) => {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing env vars: ${missing.join(", ")}`);
  }
};

module.exports = {
  env,
  ensureEnv,
  parseBoolean,
  parseNumber,
};
