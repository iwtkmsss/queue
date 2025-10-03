const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'db.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Ошибка подключения к SQLite:', err.message);
  } else {
    console.log('✅ Успешное подключение к SQLite');
  }
});

db.serialize(() => {
    db.run(`
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
    )
  `, (err) => {
    if (err) {
      console.error('❌ Ошибка создания таблицы employees:', err.message);
    } else {
      console.log('✅ Таблица employees готова');
    }
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL
    )
  `, (err) => {
    if (err) {
      console.error('❌ Помилка створення таблиці questions:', err.message);
    } else {
      console.log('✅ Таблиця questions готова');
    }
  });

  // Таблиця вікон
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  `, (err) => {
    if (err) {
      console.error('❌ Помилка створення таблиці settings:', err.message);
    } else {
      console.log('✅ Таблиця settings готова');
    }
  });

  // Таблиця черги
  db.run(`
    CREATE TABLE IF NOT EXISTS queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL,             -- ID з таблиці questions
    appointment_time TEXT NOT NULL,           -- Дата і час (ISO)
    window_id INTEGER NOT NULL,               -- Номер вікна (з employees)
    status TEXT NOT NULL DEFAULT 'waiting',    -- Статус: Очікує / Обслуговується / Завершено / Пропущено
    created_at TEXT NOT NULL                  -- Дата створення
  );
  `, (err) => {
    if (err) {
      console.error('❌ Помилка створення таблиці queue:', err.message);
    } else {
      console.log('✅ Таблиця queue готова');
    }
  });
});

db.getAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

db.allAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

db.runAsync = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

module.exports = db;
