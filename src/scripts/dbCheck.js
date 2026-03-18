const mysql = require("mysql2/promise");
const { env } = require("../config/env");

const printSection = (title, rows) => {
  console.log(`\n=== ${title} (${rows.length}) ===`);
  for (const row of rows) {
    console.log(JSON.stringify(row));
  }
};

const main = async () => {
  const connection = await mysql.createConnection({
    host: env.dbHost,
    port: env.dbPort,
    user: env.dbUser,
    password: env.dbPassword,
    database: env.dbName,
    timezone: "Z",
  });

  try {
    const [stories] = await connection.query(
      `SELECT id, ten_truyen, slug, tac_gia, source_type, source_partner_id, has_audio, audio_status
       FROM truyen_new
       WHERE source_type = 'partner'
       ORDER BY id DESC
       LIMIT 20`
    );

    const [videos] = await connection.query(
      `SELECT id, youtube_video_id, truyen_id, title, process_status, processed
       FROM videos
       ORDER BY id DESC
       LIMIT 20`
    );

    const [parts] = await connection.query(
      `SELECT id, video_id, truyen_id, part_number, audio_url
       FROM audio_parts
       ORDER BY id DESC
       LIMIT 20`
    );

    const [videoSummary] = await connection.query(
      `SELECT process_status, COUNT(*) AS total
       FROM videos
       GROUP BY process_status
       ORDER BY process_status ASC`
    );

    printSection("PARTNER STORIES", stories);
    printSection("VIDEOS", videos);
    printSection("AUDIO PARTS", parts);
    printSection("VIDEO SUMMARY", videoSummary);
  } finally {
    await connection.end();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
