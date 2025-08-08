const Queue = require('../models/Queue');
const queueService = require('../services/queueService');
const { broadcast } = require('../ws');
const moment = require('moment-timezone');

exports.getAllQueue = (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;

  Queue.getAll({ limit, offset }, (err, queue) => {
    if (err) {
      console.error('Помилка отримання черги:', err);
      return res.status(500).json({ error: 'Помилка сервера' });
    }
    res.json(queue);
  });
};

exports.updateQueueWindow = (req, res) => {
  const { id } = req.params;
  const { window_id } = req.body;

  if (!window_id) return res.status(400).json({ error: 'Не передано номер вікна' });

  Queue.updateWindow(id, window_id, (err) => {
    if (err) {
      console.error('Помилка оновлення вікна для запису:', err);
      return res.status(500).json({ error: 'Помилка сервера' });
    }
    res.json({ success: true });
  });
};


exports.createQueueRecord = async (req, res) => {
  try {
    const { question_id, appointment_time, customer_name, window_id } = req.body;

    if (!question_id || !appointment_time || !window_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Конвертуємо у формат Europe/Kyiv
    const appointmentKyiv = moment(appointment_time).tz('Europe/Kyiv').format('YYYY-MM-DD HH:mm:ss');

    const ticket = await queueService.createQueueRecord({
      question_id,
      appointment_time: appointmentKyiv,
      customer_name: customer_name || '—',
      window_id
    });

    broadcast({ type: 'queue_updated' });

    res.status(201).json(ticket);
  } catch (error) {
    console.error('Error in createQueueRecord:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.updateQueueStatus = (req, res) => {
  const { id, status } = req.body;

  Queue.updateStatus({ id, status }, (err) => {
    if (err) {
      console.error('Помилка оновлення статусу в черзі:', err);
      return res.status(500).json({ error: 'Помилка сервера' });
    }
    res.json({ message: 'Статус черги оновлено' });
  });
};

exports.reassignQueueWindow = (req, res) => {
  const { oldWindowId, newWindowId } = req.body;

  Queue.reassignWindow({ oldWindowId, newWindowId }, (err) => {
    if (err) {
      console.error('Помилка переадресації черги:', err);
      return res.status(500).json({ error: 'Помилка сервера' });
    }
    res.json({ message: 'Клієнти перенаправлені' });
  });
};

exports.getAvailableTimes = async (req, res) => {
  try {
    const { question_id, date } = req.query;
    if (!question_id || !date) {
      return res.status(400).json({ error: 'Missing question_id or date' });
    }

    const result = await queueService.getAvailableTimes(Number(question_id), date);
    res.json(result);
  } catch (error) {
    console.error('Error in getAvailableTimes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getQuestions = async (req, res) => {
  try {
    const questions = await queueService.getQuestions();
    res.json(questions);
  } catch (error) {
    console.error('Error in getQuestions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getAvailableDates = async (req, res) => {
  try {
    const { question_id } = req.query;
    if (!question_id) {
      return res.status(400).json({ error: 'Missing question_id' });
    }

    const dates = await queueService.getAvailableDates(Number(question_id));
    res.json(dates);
  } catch (error) {
    console.error('Error in getAvailableDates:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getLastByQuestion = (req, res) => {
  const db = req.app.get('db');
  const { id } = req.params;

  const sql = `
    SELECT window_id, appointment_time
    FROM queue
    WHERE question_id = ?
      AND status = 'completed'
    ORDER BY appointment_time DESC
    LIMIT 1
  `;

  db.get(sql, [id], (err, row) => {
    if (err) {
      console.error('DB error:', err);
      return res.status(500).json({ error: 'DB error' });
    }

    if (!row) {
      return res.status(404).json({ error: 'No completed record found' });
    }

    res.json(row); // { window_id, appointment_time }
  });
};

exports.moveQueueToAnotherWindow = (req, res) => {
  const from = Number(req.body.from);
  const to = Number(req.body.to);

  if (isNaN(from) || isNaN(to)) {
    console.warn('⛔ Невірні параметри:', { from, to });
    return res.status(400).json({ error: 'Невірні параметри' });
  }

  const db = req.app.get('db');

  const sql = `
    UPDATE queue
    SET window_id = ?
    WHERE window_id = ? AND status = 'waiting'
  `;

  db.run(sql, [to, from], function (err) {
    if (err) {
      console.error('❌ DB error (bulk move):', err.message);
      return res.status(500).json({ error: err.message });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Жодного запису не знайдено для переадресації' });
    }

    res.json({ success: true, moved: this.changes });
    broadcast({ type: 'queue_updated' });
  });
};

exports.getQueueStats = (req, res) => {
  const db = req.app.get('db');
  const { from, to, window_id, question_id } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: 'Необхідно вказати параметри from і to' });
  }

  const params = [from, to, window_id || null, window_id || null, question_id || null, question_id || null];

  const statsSql = `
    SELECT 
      window_id,
      COUNT(*) AS total_clients,
      ROUND(AVG(JULIANDAY(end_time) - JULIANDAY(start_time)) * 24 * 60, 1) AS avg_service_minutes
    FROM queue
    WHERE
      status = 'completed'
      AND DATE(appointment_time) BETWEEN ? AND ?
      AND (? IS NULL OR window_id = ?)
      AND (? IS NULL OR question_id = ?)
    GROUP BY window_id
  `;

  const hoursSql = `
    SELECT 
      STRFTIME('%H', appointment_time) AS hour,
      COUNT(*) AS count
    FROM queue
    WHERE
      DATE(appointment_time) BETWEEN ? AND ?
      AND (? IS NULL OR window_id = ?)
      AND (? IS NULL OR question_id = ?)
    GROUP BY hour
    ORDER BY hour
  `;

  db.all(statsSql, params, (err, statsRows) => {
    if (err) {
      console.error('Помилка SQL (stats):', err);
      return res.status(500).json({ error: 'Помилка сервера (stats)' });
    }

    db.all(hoursSql, params, (err2, hoursRows) => {
      if (err2) {
        console.error('Помилка SQL (hours):', err2);
        return res.status(500).json({ error: 'Помилка сервера (графік)' });
      }

      res.json({
        stats: statsRows,
        byHour: hoursRows
      });
    });
  });
};

exports.getQueueCount = (req, res) => {
  const db = req.app.get('db');

  db.get('SELECT COUNT(*) as count FROM queue', (err, row) => {
    if (err) {
      console.error('❌ DB error in getQueueCount:', err);
      return res.status(500).json({ error: 'DB error' });
    }
    res.json({ count: row.count });
  });
};
