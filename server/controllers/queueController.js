const Queue = require('../models/Queue');
const queueService = require('../services/queueService');
const { broadcast } = require('../ws');
const moment = require('moment-timezone');

exports.getAllQueue = (req, res) => {
  const db = req.app.get('db');
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;
  const { from, to, window_id, question_id, status, sort_field, sort_dir } = req.query;

  const conditions = [];
  const params = [];

  if (from) {
    conditions.push('DATE(q.appointment_time) >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('DATE(q.appointment_time) <= ?');
    params.push(to);
  }
  if (window_id) {
    conditions.push('q.window_id = ?');
    params.push(window_id);
  }
  if (question_id) {
    conditions.push('q.question_id = ?');
    params.push(question_id);
  }
  if (status) {
    conditions.push('q.status = ?');
    params.push(status);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const allowedSort = {
    ticket_number: 'q.ticket_number',
    appointment_time: 'q.appointment_time'
  };
  const orderField = allowedSort[sort_field] || 'q.appointment_time';
  const orderDir = String(sort_dir || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const countSql = `SELECT COUNT(*) AS total FROM queue q ${where}`;
  const dataSql = `
    SELECT q.*, COALESCE(q.question_text, qu.text) AS question_text
    FROM queue q
    LEFT JOIN questions qu ON q.question_id = qu.id
    ${where}
    ORDER BY ${orderField} ${orderDir}, CAST(q.id AS INTEGER) DESC
    LIMIT ? OFFSET ?
  `;

  db.get(countSql, params, (countErr, countRow) => {
    if (countErr) {
      console.error('Помилка отримання черги (count):', countErr);
      return res.status(500).json({ error: 'Серверна помилка' });
    }

    db.all(dataSql, [...params, limit, offset], (err, rows) => {
      if (err) {
        console.error('Помилка отримання черги (data):', err);
        return res.status(500).json({ error: 'Серверна помилка' });
      }
      res.json({ rows, total: countRow.total });
    });
  });
};

exports.updateQueueWindow = (req, res) => {
  const { id } = req.params;
  const { window_id } = req.body;

  if (!window_id) return res.status(400).json({ error: 'Не передано window_id' });

  Queue.updateWindow(id, window_id, (err) => {
    if (err) {
      console.error('Помилка оновлення window_id:', err);
      return res.status(500).json({ error: 'Серверна помилка' });
    }
    res.json({ success: true });
  });
};

exports.createQueueRecord = async (req, res) => {
  try {
    const { question_id, question_text, appointment_time, customer_name, window_id } = req.body;
    if (!question_id || !appointment_time || !window_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const appointmentKyivStr = moment
      .tz(appointment_time, 'YYYY-MM-DD HH:mm:ss', 'Europe/Kyiv')
      .format('YYYY-MM-DD HH:mm:ss');

    const ticket = await queueService.createQueueRecord({
      question_id,
      question_text: question_text || null,
      appointment_time: appointmentKyivStr,
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
      console.error('Помилка оновлення статусу черги:', err);
      return res.status(500).json({ error: 'Серверна помилка' });
    }
    res.json({ message: 'Статус оновлено' });
  });
};

exports.reassignQueueWindow = (req, res) => {
  const { oldWindowId, newWindowId } = req.body;

  Queue.reassignWindow({ oldWindowId, newWindowId }, (err) => {
    if (err) {
      console.error('Помилка масового перенесення вікна:', err);
      return res.status(500).json({ error: 'Серверна помилка' });
    }
    res.json({ message: 'Клієнтів переміщено' });
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

    res.json(row);
  });
};

exports.moveQueueToAnotherWindow = (req, res) => {
  const from = Number(req.body.from);
  const to = Number(req.body.to);

  if (isNaN(from) || isNaN(to)) {
    console.warn('Невірні параметри переносу:', { from, to });
    return res.status(400).json({ error: 'Некоректні параметри' });
  }

  const db = req.app.get('db');

  const sql = `
    UPDATE queue
    SET window_id = ?
    WHERE window_id = ? AND status = 'waiting'
  `;

  db.run(sql, [to, from], function (err) {
    if (err) {
      console.error('⛔ DB error (bulk move):', err.message);
      return res.status(500).json({ error: err.message });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Клієнтів не знайдено для переносу' });
    }

    res.json({ success: true, moved: this.changes });
    broadcast({ type: 'queue_updated' });
  });
};

exports.getQueueStats = (req, res) => {
  const db = req.app.get('db');
  const { from, to, window_id, question_id, status, group_by } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: 'Необхідно вказати параметри дат from і to' });
  }

  const groupBy = ['hour', 'window', 'question'].includes(group_by) ? group_by : 'hour';

  const params = [
    from,
    to,
    window_id || null,
    window_id || null,
    question_id || null,
    question_id || null,
    status || null,
    status || null
  ];

  const baseWhere = `
    DATE(q.appointment_time) BETWEEN ? AND ?
    AND (? IS NULL OR q.window_id = ?)
    AND (? IS NULL OR q.question_id = ?)
    AND (? IS NULL OR q.status = ?)
  `;

  const statsSql = `
    SELECT 
      q.window_id,
      COUNT(*) AS total_clients,
      ROUND(AVG(CASE WHEN q.start_time IS NOT NULL AND q.end_time IS NOT NULL THEN JULIANDAY(q.end_time) - JULIANDAY(q.start_time) END) * 24 * 60, 1) AS avg_service_minutes
    FROM queue q
    WHERE ${baseWhere}
    GROUP BY q.window_id
  `;

  let groupExpr = "STRFTIME('%H', q.appointment_time)";
  let orderExpr = 'label';

  if (groupBy === 'window') {
    groupExpr = 'q.window_id';
    orderExpr = 'CAST(label AS INTEGER)';
  } else if (groupBy === 'question') {
    groupExpr = 'COALESCE(q.question_text, qu.text, "Невідома послуга")';
  }

  const chartSql = `
    SELECT 
      ${groupExpr} AS label,
      COUNT(*) AS count
    FROM queue q
    LEFT JOIN questions qu ON q.question_id = qu.id
    WHERE ${baseWhere}
    GROUP BY label
    ORDER BY ${orderExpr}
  `;

  db.all(statsSql, params, (err, statsRows) => {
    if (err) {
      console.error('Помилка SQL (stats):', err);
      return res.status(500).json({ error: 'Помилка сервера (stats)' });
    }

    db.all(chartSql, params, (err2, chartRows) => {
      if (err2) {
        console.error('Помилка SQL (chart):', err2);
        return res.status(500).json({ error: 'Помилка сервера (chart)' });
      }

      res.json({
        stats: statsRows,
        chart: chartRows,
        groupBy
      });
    });
  });
};

exports.exportQueueRaw = (req, res) => {
  const db = req.app.get('db');
  const { from, to, window_id, question_id, status, format } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: 'Необхідно вказати параметри дат from і to' });
  }

  const params = [
    from,
    to,
    window_id || null,
    window_id || null,
    question_id || null,
    question_id || null,
    status || null,
    status || null
  ];

  const sql = `
    SELECT
      q.id,
      q.window_id,
      q.question_id,
      q.ticket_number,
      COALESCE(q.question_text, qu.text) AS question_text,
      q.appointment_time,
      q.start_time,
      q.end_time,
      q.status,
      q.created_at,
      q.personal_account,
      q.extra_actions,
      q.extra_other_text,
      q.application_yesno,
      q.application_types,
      q.manager_comment
    FROM queue q
    LEFT JOIN questions qu ON q.question_id = qu.id
    WHERE
      DATE(q.appointment_time) BETWEEN ? AND ?
      AND (? IS NULL OR q.window_id = ?)
      AND (? IS NULL OR q.question_id = ?)
      AND (? IS NULL OR q.status = ?)
    ORDER BY q.appointment_time ASC, q.id ASC
  `;

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('Помилка SQL (export):', err);
      return res.status(500).json({ error: 'Помилка сервера (export)' });
    }

    const isJson = String(format || '').toLowerCase() === 'json';
    if (isJson) {
      return res.json({ rows });
    }

    const headers = [
      'id',
      'window_id',
      'question_id',
      'question_text',
      'ticket_number',
      'appointment_time',
      'start_time',
      'end_time',
      'status',
      'created_at',
      'personal_account',
      'extra_actions',
      'extra_other_text',
      'application_yesno',
      'application_types',
      'manager_comment'
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (/[\",\\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csv = [
      headers.join(','),
      ...rows.map((row) => headers.map((h) => escapeCsv(row[h])).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=queue-export-${from}-to-${to}.csv`);
    res.send(csv);
  });
};

exports.updateQueueFull = (req, res) => {
  const db = req.app.get('db');
  const { id } = req.params;
  const body = req.body || {};

  const toArray = (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') {
      try {
        const t = v.trim();
        if (!t) return [];
        return t.startsWith('[') ? JSON.parse(t) : t.split(',').map((s) => s.trim()).filter(Boolean);
      } catch {
        return [];
      }
    }
    return [];
  };

  db.get(`SELECT * FROM queue WHERE id = ?`, [id], (err, row) => {
    if (err || !row) {
      return res.status(404).json({ error: 'Запис не знайдено' });
    }

    const next = {
      ticket_number: body.ticket_number ?? row.ticket_number ?? null,
      question_id: body.question_id ?? row.question_id,
      question_text: body.question_text ?? row.question_text ?? null,
      appointment_time: body.appointment_time ?? row.appointment_time,
      start_time: body.start_time ?? row.start_time ?? null,
      end_time: body.end_time ?? row.end_time ?? null,
      window_id: body.window_id ?? row.window_id,
      status: body.status ?? row.status,
      personal_account: body.personal_account ?? row.personal_account ?? null,
      extra_actions: JSON.stringify(toArray(body.extra_actions ?? row.extra_actions)),
      extra_other_text: body.extra_other_text ?? row.extra_other_text ?? null,
      application_yesno:
        body.application_yesno === null || body.application_yesno === undefined
          ? row.application_yesno
          : body.application_yesno
            ? 1
            : 0,
      application_types: JSON.stringify(toArray(body.application_types ?? row.application_types)),
      manager_comment: body.manager_comment ?? row.manager_comment ?? null,
    };

    const sql = `
      UPDATE queue SET
        ticket_number = ?,
        question_id = ?,
        question_text = ?,
        appointment_time = ?,
        start_time = ?,
        end_time = ?,
        window_id = ?,
        status = ?,
        personal_account = ?,
        extra_actions = ?,
        extra_other_text = ?,
        application_yesno = ?,
        application_types = ?,
        manager_comment = ?
      WHERE id = ?
    `;

    db.run(
      sql,
      [
        next.ticket_number,
        next.question_id,
        next.question_text,
        next.appointment_time,
        next.start_time,
        next.end_time,
        next.window_id,
        next.status,
        next.personal_account,
        next.extra_actions,
        next.extra_other_text,
        next.application_yesno,
        next.application_types,
        next.manager_comment,
        id
      ],
      (e) => {
        if (e) {
          console.error('Помилка оновлення queue (full):', e);
          return res.status(500).json({ error: 'Помилка оновлення' });
        }
        broadcast({ type: 'queue_updated' });
        res.json({ success: true });
      }
    );
  });
};

exports.getQueueCount = (req, res) => {
  const db = req.app.get('db');

  db.get('SELECT COUNT(*) as count FROM queue', (err, row) => {
    if (err) {
      console.error('⛔ DB error in getQueueCount:', err);
      return res.status(500).json({ error: 'DB error' });
    }
    res.json({ count: row.count });
  });
};
