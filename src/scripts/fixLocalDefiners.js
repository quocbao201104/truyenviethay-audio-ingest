const mysql = require("mysql2/promise");
const { env } = require("../config/env");
const logger = require("../config/logger");

const statements = [
  "DROP TRIGGER IF EXISTS after_author_follow_insert",
  "DROP TRIGGER IF EXISTS after_author_follow_delete",
  "DROP TRIGGER IF EXISTS after_chapter_insert",
  "DROP TRIGGER IF EXISTS after_story_insert",
  "DROP TRIGGER IF EXISTS after_truyen_insert",
  "DROP TRIGGER IF EXISTS after_truyen_update",
  "DROP TRIGGER IF EXISTS after_truyen_delete",
  `
    CREATE TRIGGER after_author_follow_insert
    AFTER INSERT ON author_follows
    FOR EACH ROW
    BEGIN
      UPDATE authors
      SET follower_count = follower_count + 1
      WHERE id = NEW.author_id;
    END
  `,
  `
    CREATE TRIGGER after_author_follow_delete
    AFTER DELETE ON author_follows
    FOR EACH ROW
    BEGIN
      UPDATE authors
      SET follower_count = GREATEST(follower_count - 1, 0)
      WHERE id = OLD.author_id;
    END
  `,
  `
    CREATE TRIGGER after_chapter_insert
    AFTER INSERT ON chuong
    FOR EACH ROW
    BEGIN
      UPDATE truyen_new
      SET thoi_gian_cap_nhat = NEW.thoi_gian_dang,
          last_chapter_id = NEW.id
      WHERE id = NEW.truyen_id;
    END
  `,
  `
    CREATE TRIGGER after_truyen_insert
    AFTER INSERT ON truyen_new
    FOR EACH ROW
    BEGIN
      IF NEW.author_id IS NOT NULL AND NEW.is_deleted = 0 THEN
        UPDATE authors
        SET total_stories = total_stories + 1
        WHERE id = NEW.author_id;
      END IF;
    END
  `,
  `
    CREATE TRIGGER after_truyen_update
    AFTER UPDATE ON truyen_new
    FOR EACH ROW
    BEGIN
      DECLARE old_active TINYINT;
      DECLARE new_active TINYINT;
      SET old_active = (OLD.author_id IS NOT NULL AND OLD.is_deleted = 0);
      SET new_active = (NEW.author_id IS NOT NULL AND NEW.is_deleted = 0);

      IF (OLD.author_id IS NULL AND NEW.author_id IS NOT NULL)
         OR (OLD.author_id IS NOT NULL AND NEW.author_id IS NULL)
         OR (OLD.author_id <> NEW.author_id) THEN
        IF old_active = 1 THEN
          UPDATE authors
          SET total_stories = GREATEST(total_stories - 1, 0)
          WHERE id = OLD.author_id;
        END IF;
        IF new_active = 1 THEN
          UPDATE authors
          SET total_stories = total_stories + 1
          WHERE id = NEW.author_id;
        END IF;
      ELSEIF old_active <> new_active THEN
        IF old_active = 1 THEN
          UPDATE authors
          SET total_stories = GREATEST(total_stories - 1, 0)
          WHERE id = OLD.author_id;
        END IF;
        IF new_active = 1 THEN
          UPDATE authors
          SET total_stories = total_stories + 1
          WHERE id = NEW.author_id;
        END IF;
      END IF;
    END
  `,
  `
    CREATE TRIGGER after_truyen_delete
    AFTER DELETE ON truyen_new
    FOR EACH ROW
    BEGIN
      IF OLD.author_id IS NOT NULL AND OLD.is_deleted = 0 THEN
        UPDATE authors
        SET total_stories = GREATEST(total_stories - 1, 0)
        WHERE id = OLD.author_id;
      END IF;
    END
  `,
];

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
    for (const statement of statements) {
      logger.info(`Running trigger fix statement: ${statement.trim().split(/\s+/).slice(0, 4).join(" ")}`);
      await connection.query(statement);
    }

    logger.info("Local trigger definer fix completed");
  } finally {
    await connection.end();
  }
};

main().catch((error) => {
  logger.error("Local trigger definer fix failed", error);
  process.exitCode = 1;
});
