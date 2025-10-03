const db = require('../database');

exports.getSetting = (key, cb) => {
  db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
    if (err) return cb(err);
    cb(null, row ? row.value : null);
  });
};

exports.setSetting = (key, value, cb) => {
  db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
    cb
  );
};
