const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'db.sqlite');

function createDb() {
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('❌ Помилка підключення до SQLite:', err.message);
      throw err;
    }
    console.log('✅ Підключено до SQLite');
  });
  return db;
}

async function ensureTables(db) {
  const run = (sql) =>
    new Promise((resolve, reject) => db.run(sql, (err) => (err ? reject(err) : resolve())));

  const tables = [
    `
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      position TEXT NOT NULL,
      password TEXT NOT NULL,
      status TEXT DEFAULT 'Не працює',
      created_at DATETIME NOT NULL,
      window_number INTEGER,
      topics TEXT,
      schedule TEXT,
      priority INTEGER DEFAULT 0
    )`,
    `
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL
    )`,
    `
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`,
    `
    CREATE TABLE IF NOT EXISTS queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number INTEGER,
      question_id INTEGER NOT NULL,
      appointment_time TEXT NOT NULL,
      window_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting',
      created_at TEXT NOT NULL
    )`,
  ];

  for (const sql of tables) {
    await run(sql);
  }
}

async function ensureColumns(db) {
  const getColumns = (table) =>
    new Promise((resolve, reject) =>
      db.all(`PRAGMA table_info(${table})`, (err, rows) =>
        err ? reject(err) : resolve(rows || [])
      )
    );

  const addColumn = (table, columnSql) =>
    new Promise((resolve, reject) =>
      db.run(`ALTER TABLE ${table} ADD COLUMN ${columnSql}`, (err) =>
        err ? reject(err) : resolve()
      )
    );

  // Повний перелік полів queue, які очікуємо бачити.
  const desiredQueueColumns = [
    { name: 'start_time', ddl: 'start_time TEXT' },
    { name: 'end_time', ddl: 'end_time TEXT' },
    { name: 'manager_comment', ddl: 'manager_comment TEXT' },
    { name: 'application_types', ddl: 'application_types TEXT' },
    { name: 'application_yesno', ddl: 'application_yesno INTEGER DEFAULT 0' },
    { name: 'extra_other_text', ddl: 'extra_other_text TEXT' },
    { name: 'extra_actions', ddl: 'extra_actions TEXT' },
    { name: 'personal_account', ddl: 'personal_account TEXT' },
    { name: 'question_text', ddl: 'question_text TEXT' },
    { name: 'ticket_number', ddl: 'ticket_number INTEGER' },
  ];

  const queueColumns = await getColumns('queue');
  const existing = new Set(queueColumns.map((c) => c.name));

  for (const col of desiredQueueColumns) {
    if (!existing.has(col.name)) {
      await addColumn('queue', col.ddl);
      console.log(`✅ Додано стовпець ${col.name} до queue`);
    }
  }
}

function promisifyDb(db) {
  db.getAsync = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });

  db.allAsync = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });

  db.runAsync = (sql, params = []) =>
    new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });

  return db;
}

// Ініціалізація
const db = createDb();
ensureTables(db)
  .then(() => ensureColumns(db))
  .catch((err) => {
    console.error('❌ Помилка ініціалізації БД:', err.message || err);
  });

module.exports = promisifyDb(db);
