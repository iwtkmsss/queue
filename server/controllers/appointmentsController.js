const moment = require('moment-timezone');
const { broadcast } = require('../ws');

// Отримання записів на сьогодні
exports.getTodayAppointments = (req, res) => {
  const db = req.app.get('db');
  const { window } = req.query;

  if (!window) {
    return res.status(400).json({ error: 'Не вказано номер вікна' });
  }

  const today = moment().tz('Europe/Kiev').format('YYYY-MM-DD');

  const sql = `
    SELECT q.id, q.appointment_time, q.status, que.text AS question_text
    FROM queue q
    JOIN questions que ON q.question_id = que.id
    WHERE DATE(q.appointment_time) = ?
      AND q.window_id = ?
    ORDER BY q.appointment_time ASC
  `;

  db.all(sql, [today, window], (err, rows) => {
    if (err) {
      console.error('❌ Помилка отримання записів із queue:', err);
      return res.status(500).json({ error: 'Помилка сервера при отриманні записів' });
    }

    res.json(rows);
  });
};

// СТАРТ
exports.startAppointment = (req, res) => {
  const db = req.app.get('db');
  const { id } = req.params;
  const now = moment().tz('Europe/Kyiv').format('YYYY-MM-DD HH:mm:ss');

  db.run(
    `UPDATE queue SET status = 'in_progress', start_time = ? WHERE id = ?`,
    [now, id],
    (err) => {
      if (err) {
        console.error('❌ DB error (update start):', err);
        return res.status(500).json({ error: 'DB error (start)' });
      }

      db.get(`SELECT id, window_id FROM queue WHERE id = ?`, [id], (err2, row) => {
        if (err2) {
          console.error('❌ DB error (fetch for TTS):', err2);
          return res.status(500).json({ error: 'DB error (fetch for TTS)' });
        }

        if (!row) {
          console.error('❌ Queue row not found for ID:', id);
          return res.status(404).json({ error: 'Queue row not found' });
        }

        const queue_number = row.id;
        const window_number = row.window_id || 1;

        broadcast({ type: 'queue_updated' });
        broadcast({ type: 'client_called', data: { queue_number, window_number } });

        res.json({ success: true });
      });
    }
  );
};



// ФІНІШ
exports.finishAppointment = (req, res) => {
  const db = req.app.get('db');
  const { id } = req.params;
  const now = moment().tz('Europe/Kyiv').format('YYYY-MM-DD HH:mm:ss');

  db.run(
    `UPDATE queue SET status = 'completed', end_time = ? WHERE id = ?`,
    [now, id],
    (err) => {
      if (err) return res.status(500).json({ error: 'DB error (finish)' });
      broadcast({ type: 'queue_updated' });
      res.json({ success: true });
    }
  );
};

// ПРОПУЩЕНО (автоматично)
exports.skipAppointment = (req, res) => {
  const db = req.app.get('db');
  const { id } = req.params;
  const now = moment().tz('Europe/Kyiv').format('YYYY-MM-DD HH:mm:ss');

  db.run(
    `UPDATE queue SET status = 'missed', start_time = ?, end_time = ? WHERE id = ?`,
    [now, now, id],
    (err) => {
      if (err) return res.status(500).json({ error: 'DB error (skip)' });
      broadcast({ type: 'queue_updated' });
      res.json({ success: true });
    }
  );
};

// НЕ ЗʼЯВИВСЯ (вручну)
exports.didNotAppear = (req, res) => {
  const db = req.app.get('db');
  const { id } = req.params;
  const now = moment().tz('Europe/Kyiv').format('YYYY-MM-DD HH:mm:ss');

  db.get('SELECT start_time FROM queue WHERE id = ?', [id], (err, row) => {
    if (err || !row) {
      return res.status(500).json({ error: 'Запис не знайдено' });
    }

    const start = row.start_time || now;

    db.run(
      `UPDATE queue SET status = 'did_not_appear', ${!row.start_time ? 'start_time = ?, ' : ''}end_time = ? WHERE id = ?`,
      !row.start_time ? [start, now, id] : [now, id],
      (err2) => {
        if (err2) return res.status(500).json({ error: 'DB error (did_not_appear)' });
        broadcast({ type: 'queue_updated' });
        res.json({ success: true });
      }
    );
  });
};
