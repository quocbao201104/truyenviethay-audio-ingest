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
    const [triggers] = await connection.query(
      `SELECT TRIGGER_NAME, EVENT_OBJECT_TABLE, ACTION_TIMING, EVENT_MANIPULATION, DEFINER
       FROM information_schema.TRIGGERS
       WHERE TRIGGER_SCHEMA = ?
       ORDER BY EVENT_OBJECT_TABLE, TRIGGER_NAME`,
      [env.dbName]
    );

    const [views] = await connection.query(
      `SELECT TABLE_NAME, DEFINER
       FROM information_schema.VIEWS
       WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_NAME`,
      [env.dbName]
    );

    const [routines] = await connection.query(
      `SELECT ROUTINE_NAME, ROUTINE_TYPE, DEFINER
       FROM information_schema.ROUTINES
       WHERE ROUTINE_SCHEMA = ?
       ORDER BY ROUTINE_TYPE, ROUTINE_NAME`,
      [env.dbName]
    );

    const [events] = await connection.query(
      `SELECT EVENT_NAME, DEFINER
       FROM information_schema.EVENTS
       WHERE EVENT_SCHEMA = ?
       ORDER BY EVENT_NAME`,
      [env.dbName]
    );

    printSection("TRIGGERS", triggers);
    printSection("VIEWS", views);
    printSection("ROUTINES", routines);
    printSection("EVENTS", events);
  } finally {
    await connection.end();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
