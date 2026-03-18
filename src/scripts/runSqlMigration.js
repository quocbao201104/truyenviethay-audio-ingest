const fs = require("fs/promises");
const path = require("path");
const mysql = require("mysql2/promise");
const { env } = require("../config/env");
const logger = require("../config/logger");

const MIGRATIONS_DIR = path.resolve(__dirname, "../../sql");

const ensureMigrationTable = async (connection) => {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      migration_name VARCHAR(255) NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_app_migrations_name (migration_name)
    )
  `);
};

const getAppliedMigrations = async (connection) => {
  const [rows] = await connection.query(
    "SELECT migration_name FROM app_migrations ORDER BY migration_name ASC"
  );
  return new Set(rows.map((row) => row.migration_name));
};

const readMigrationFiles = async () => {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
};

const main = async () => {
  const connection = await mysql.createConnection({
    host: env.dbHost,
    port: env.dbPort,
    user: env.dbUser,
    password: env.dbPassword,
    database: env.dbName,
    multipleStatements: true,
    timezone: "Z",
  });

  try {
    await ensureMigrationTable(connection);
    const applied = await getAppliedMigrations(connection);
    const files = await readMigrationFiles();

    for (const fileName of files) {
      if (applied.has(fileName)) {
        logger.info(`Skipping already applied migration ${fileName}`);
        continue;
      }

      const fullPath = path.join(MIGRATIONS_DIR, fileName);
      const sql = await fs.readFile(fullPath, "utf8");

      logger.info(`Applying migration ${fileName}`);
      await connection.beginTransaction();
      try {
        await connection.query(sql);
        await connection.query(
          "INSERT INTO app_migrations (migration_name) VALUES (?)",
          [fileName]
        );
        await connection.commit();
        logger.info(`Applied migration ${fileName}`);
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }

    logger.info("Audio migrations completed");
  } finally {
    await connection.end();
  }
};

main().catch((error) => {
  logger.error("Audio migration failed", error);
  process.exitCode = 1;
});
