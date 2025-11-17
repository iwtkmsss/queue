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
    SELECT 
      q.id,
      q.appointment_time,
      q.status,
      COALESCE(q.question_text, que.text) AS question_text,
      q.personal_account,
      q.extra_actions,
      q.extra_other_text,
      q.application_yesno,
      q.application_types,
      q.manager_comment
    FROM queue q
    LEFT JOIN questions que ON q.question_id = que.id
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

  // локальна валідація на фініші
  const validate = (rowOrBody) => {
    const toArray = (v) => {
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') {
        try { const t = v.trim(); return t.startsWith('[') ? JSON.parse(t) : (t ? [t] : []); }
        catch { return []; }
      }
      return [];
    };

    const errors = [];
    const personal_account = (rowOrBody.personal_account ?? '').trim();
    const extra_actions = toArray(rowOrBody.extra_actions);
    const extra_other_text = (rowOrBody.extra_other_text ?? '').trim();
    const application_yesno =
      rowOrBody.application_yesno === null || rowOrBody.application_yesno === undefined
        ? null
        : !!rowOrBody.application_yesno;
    const application_types = application_yesno ? toArray(rowOrBody.application_types) : [];

    if (!personal_account) errors.push('Вкажіть особовий рахунок.');
    if (extra_actions.includes('EX_OTHER_FREE_TEXT') && !extra_other_text) {
      errors.push('Опишіть "Інше" у текстовому полі.');
    }
    if (application_yesno === null) errors.push('Вкажіть, чи є заява (так/ні).');
    if (application_yesno === true && application_types.length === 0) {
      errors.push('Оберіть тип(и) заяви.');
    }

    return { ok: errors.length === 0, errors };
  };

  // якщо фронт надіслав мету в тілі — перевіряємо її; інакше читаємо з БД
  const finishWith = (payload) => {
    const v = validate(payload);
    if (!v.ok) return res.status(400).json({ errors: v.errors });

    db.run(
      `UPDATE queue SET status='completed', end_time=? WHERE id=?`,
      [now, id],
      (err) => {
        if (err) return res.status(500).json({ error: 'DB error (finish)' });
        broadcast({ type: 'queue_updated' });
        res.json({ success: true });
      }
    );
  };

  if (req.body && Object.keys(req.body).length) {
    // приймаємо з фронту (автозбереження могло ще не відпрацювати)
    // швидко підсейвимо м’яко:
    req.params.id = id;
    exports.updateMetaAppointment(req, { json: () => {}, status: () => ({ json: () => {} }) });
    return finishWith(req.body);
  }

  // або тягнемо з БД
  db.get('SELECT * FROM queue WHERE id=?', [id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Запис не знайдено' });
    finishWith(row);
  });
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

// ОНОВЛЕННЯ ДАНИХ (soft save: без жорсткої валідації)
exports.updateMetaAppointment = (req, res) => {
  const db = req.app.get('db');
  const { id } = req.params;

  const {
    personal_account = '',
    extra_actions = [],
    extra_other_text = '',
    application_yesno = null,
    application_types = [],
    manager_comment = ''
  } = req.body || {};

  // м'яка нормалізація форматів
  const toArray = (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') {
      try {
        const t = v.trim();
        return t.startsWith('[') ? JSON.parse(t) : (t ? [t] : []);
      } catch { return []; }
    }
    return [];
  };

  const sql = `
    UPDATE queue SET
      personal_account   = ?,
      extra_actions      = ?,
      extra_other_text   = ?,
      application_yesno  = ?,
      application_types  = ?,
      manager_comment    = ?
    WHERE id = ?
  `;

  db.run(
    sql,
    [
      String(personal_account || '').trim(),
      JSON.stringify(toArray(extra_actions)),
      String(extra_other_text || '').trim() || null,
      application_yesno === null ? null : (application_yesno ? 1 : 0),
      (application_yesno ? JSON.stringify(toArray(application_types)) : null),
      String(manager_comment || '').trim() || null,
      id
    ],
    (err) => {
      if (err) {
        console.error('❌ DB error (updateMetaAppointment):', err);
        return res.status(500).json({ error: 'DB error (update meta)' });
      }
      // без перевірок: просто повідомляємо фронт
      broadcast({ type: 'queue_updated' });
      res.json({ ok: true });
    }
  );
};

