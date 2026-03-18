const { env } = require("./env");

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevel = levels[env.logLevel] ?? levels.info;

const shouldLog = (level) => (levels[level] ?? levels.info) <= currentLevel;

const log = (level, message, meta) => {
  if (!shouldLog(level)) {
    return;
  }

  const timestamp = new Date().toISOString();
  if (meta !== undefined) {
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, meta);
    return;
  }

  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
};

module.exports = {
  error: (message, meta) => log("error", message, meta),
  warn: (message, meta) => log("warn", message, meta),
  info: (message, meta) => log("info", message, meta),
  debug: (message, meta) => log("debug", message, meta),
};
