const moment = require('moment-timezone');
const { broadcast } = require('../ws');

// Отримання записів на сьогодні
exports.getTodayAppointments = (req, res) => {
  const db = req.app.get('db');
  const { window, date } = req.query;

  if (!window) {
    return res.status(400).json({ error: 'Не вказано номер вікна' });
  }

  const dayStr = typeof date === 'string' && date.trim() ? date.trim() : null;
  const dayMoment = dayStr
    ? moment.tz(dayStr, 'YYYY-MM-DD', true, 'Europe/Kyiv')
    : moment().tz('Europe/Kyiv');

  if (!dayMoment.isValid()) {
    return res.status(400).json({ error: 'Невірний формат дати. Використовуйте YYYY-MM-DD.' });
  }

  const targetDate = dayMoment.format('YYYY-MM-DD');

  const sql = `
    SELECT 
      q.id,
      q.ticket_number,
      q.appointment_time,
      q.status,
      q.queue_type,
      COALESCE(q.question_text, que.text) AS question_text,
      q.personal_account,
      q.extra_actions,
      q.extra_other_text,
      q.application_yesno,
      q.application_types,
      q.manager_comment,
      q.meta_tabs,
      q.service_zone
    FROM queue q
    LEFT JOIN questions que ON q.question_id = que.id
    WHERE DATE(q.appointment_time) = ?
      AND q.window_id = ?
    ORDER BY q.appointment_time ASC
  `;


  db.all(sql, [targetDate, window], (err, rows) => {
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

      db.get(`SELECT id, window_id, ticket_number FROM queue WHERE id = ?`, [id], (err2, row) => {
        if (err2) {
          console.error('❌ DB error (fetch for TTS):', err2);
          return res.status(500).json({ error: 'DB error (fetch for TTS)' });
        }

        if (!row) {
          console.error('❌ Queue row not found for ID:', id);
          return res.status(404).json({ error: 'Queue row not found' });
        }

        const queue_number = row.ticket_number || row.id;
        const window_number = row.window_id || 1;

        broadcast({ type: 'queue_updated' });
        broadcast({ type: 'client_called', data: { queue_number, window_number } });

        res.json({ success: true });
      });
    }
  );
};



// ФІНІШ
exports.finishAppointment = async (req, res) => {
  const db = req.app.get('db');
  const { id } = req.params;
  const now = moment().tz('Europe/Kyiv').format('YYYY-MM-DD HH:mm:ss');

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

  const normalizeServiceZone = (value) => {
    if (value === null || value === undefined) return true;
    const str = String(value).toLowerCase();
    return !(value === false || value === 0 || str === '0' || str === 'false');
  };

  const normalizeTabStatus = (value) => {
    const status = String(value || '').toLowerCase();
    return status === 'in_progress' || status === 'completed' || status === 'canceled'
      ? status
      : 'waiting';
  };

  const normalizeTab = (tab = {}) => {
    const applicationYesNo =
      tab.application_yesno === null || tab.application_yesno === undefined
        ? false
        : !!tab.application_yesno;
    const rawSlot = Number(tab.tab_slot);
    const tabSlot = Number.isFinite(rawSlot) && rawSlot > 0 ? rawSlot : null;

    return {
      personal_account: tab.personal_account || '',
      extra_actions: toArray(tab.extra_actions),
      extra_other_text: tab.extra_other_text || '',
      application_yesno: applicationYesNo,
      application_types: applicationYesNo ? toArray(tab.application_types) : [],
      manager_comment: tab.manager_comment || '',
      service_zone: normalizeServiceZone(tab.service_zone),
      tab_status: normalizeTabStatus(tab.tab_status),
      tab_slot: tabSlot,
    };
  };

  const parseTabs = (raw) => {
    if (!raw) return null;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
  };

  const validateTab = (tab) => {
    const errors = [];
    const requiresAccount = tab.service_zone !== false;

    if (requiresAccount && !String(tab.personal_account || '').trim()) {
      errors.push('Абонентський номер споживача не вказано.');
    }
    if (tab.extra_actions.includes('EX_OTHER_FREE_TEXT') && !String(tab.extra_other_text || '').trim()) {
      errors.push('Опишіть "Інше" у текстовому полі.');
    }
    if (tab.application_yesno === true && tab.application_types.length === 0) {
      errors.push('Оберіть тип(и) заяви.');
    }
    return errors;
  };

  const payload = req.body && Object.keys(req.body).length ? req.body : null;
  const finishTabIndexRaw = payload?.finish_tab_index;
  const finishTabIndex =
    finishTabIndexRaw === null || finishTabIndexRaw === undefined
      ? 0
      : Number(finishTabIndexRaw);

  if (!Number.isFinite(finishTabIndex) || finishTabIndex < 0) {
    return res.status(400).json({ error: 'Невірний індекс вкладки' });
  }

  let row;
  try {
    row = await db.getAsync('SELECT * FROM queue WHERE id=?', [id]);
  } catch (err) {
    return res.status(500).json({ error: 'DB error (fetch)' });
  }
  if (!row) return res.status(404).json({ error: 'Запис не знайдено' });

  const rawTabs = payload ? parseTabs(payload.meta_tabs) : null;
  const rowTabs = parseTabs(row.meta_tabs);

  const tabs = (() => {
    if (payload) {
      if (rawTabs && rawTabs.length) return rawTabs.map(normalizeTab).slice(0, 5);
      return [normalizeTab(payload)];
    }
    if (rowTabs && rowTabs.length) return rowTabs.map(normalizeTab).slice(0, 5);
    return [normalizeTab(row)];
  })();

  if (tabs[0]) {
    const baseStatus = normalizeTabStatus(row.status);
    if (baseStatus !== 'waiting' && tabs[0].tab_status === 'waiting') {
      tabs[0].tab_status = baseStatus;
    }
  }

  if (finishTabIndex >= tabs.length) {
    return res.status(400).json({ error: 'Вкладка не знайдена' });
  }

  const tabToFinish = tabs[finishTabIndex];
  tabToFinish.tab_status = 'completed';
  const tabErrors = validateTab(tabToFinish);
  if (tabErrors.length) {
    const prefix = tabs.length > 1 ? `Вкладка ${finishTabIndex + 1}: ` : '';
    return res.status(400).json({ errors: tabErrors.map((err) => `${prefix}${err}`) });
  }

  const allClosed = tabs.every((tab) => {
    const status = normalizeTabStatus(tab.tab_status);
    return status === 'completed' || status === 'canceled';
  });

  if (payload) {
    // Accept payload from frontend (autosave may not have finished)
    req.params.id = id;
    req.body.meta_tabs = tabs;
    exports.updateMetaAppointment(req, { json: () => {}, status: () => ({ json: () => {} }) });
  }

  try {
    if (finishTabIndex === 0) {
      if (tabs.length === 1 || allClosed) {
        await db.runAsync(`UPDATE queue SET status='completed', end_time=? WHERE id=?`, [now, id]);
      }
    } else {
      await db.runAsync(
        `
          INSERT INTO queue (
            ticket_number,
            question_id,
            question_text,
            appointment_time,
            window_id,
            status,
            start_time,
            end_time,
            personal_account,
            extra_actions,
            extra_other_text,
            application_yesno,
            application_types,
            manager_comment,
            meta_tabs,
            queue_type,
            service_zone,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          row.ticket_number,
          row.question_id,
          row.question_text || null,
          row.appointment_time,
          row.window_id,
          'completed',
          row.start_time || now,
          now,
          String(tabToFinish.personal_account || '').trim(),
          JSON.stringify(tabToFinish.extra_actions),
          String(tabToFinish.extra_other_text || '').trim() || null,
          tabToFinish.application_yesno === null ? null : (tabToFinish.application_yesno ? 1 : 0),
          (tabToFinish.application_yesno ? JSON.stringify(tabToFinish.application_types) : null),
          String(tabToFinish.manager_comment || '').trim() || null,
          JSON.stringify([tabToFinish]),
          row.queue_type || 'regular',
          tabToFinish.service_zone ? 1 : 0,
          row.created_at || now
        ]
      );

      if (allClosed) {
        await db.runAsync(`UPDATE queue SET status='completed', end_time=? WHERE id=?`, [now, id]);
      }
    }

    broadcast({ type: 'queue_updated' });
    res.json({ success: true });
  } catch (err) {
    console.error('DB error (finish):', err);
    res.status(500).json({ error: 'DB error (finish)' });
  }
};


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
  const body = req.body || {};
  const now = moment().tz('Europe/Kyiv').format('YYYY-MM-DD HH:mm:ss');

  // Soft normalization of formats
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

  const normalizeServiceZone = (value) => {
    if (value === null || value === undefined) return true;
    const str = String(value).toLowerCase();
    return !(value === false || value === 0 || str === '0' || str === 'false');
  };

  const normalizeTabStatus = (value) => {
    const status = String(value || '').toLowerCase();
    return status === 'in_progress' || status === 'completed' || status === 'canceled'
      ? status
      : 'waiting';
  };

  const normalizeTab = (tab = {}) => {
    const applicationYesNo =
      tab.application_yesno === null || tab.application_yesno === undefined
        ? false
        : !!tab.application_yesno;
    const rawSlot = Number(tab.tab_slot);
    const tabSlot = Number.isFinite(rawSlot) && rawSlot > 0 ? rawSlot : null;

    return {
      personal_account: tab.personal_account || '',
      extra_actions: toArray(tab.extra_actions),
      extra_other_text: tab.extra_other_text || '',
      application_yesno: applicationYesNo,
      application_types: applicationYesNo ? toArray(tab.application_types) : [],
      manager_comment: tab.manager_comment || '',
      service_zone: normalizeServiceZone(tab.service_zone),
      tab_status: normalizeTabStatus(tab.tab_status),
      tab_slot: tabSlot,
    };
  };

  const parseTabs = (raw) => {
    if (!raw) return null;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
  };

  const rawTabs = parseTabs(body.meta_tabs);
  const normalizedTabs = Array.isArray(rawTabs) && rawTabs.length
    ? rawTabs.map(normalizeTab).slice(0, 5)
    : [normalizeTab(body)];

  const primary = normalizedTabs[0] || normalizeTab(body);
  const isClosedTab = (tab) => {
    const status = normalizeTabStatus(tab?.tab_status);
    return status === 'completed' || status === 'canceled';
  };
  const baseCompleted = normalizeTabStatus(primary?.tab_status) === 'completed';
  const allClosed = normalizedTabs.length > 0 && normalizedTabs.every(isClosedTab);
  const shouldComplete = baseCompleted && allClosed;

  const sql = `
    UPDATE queue SET
      personal_account   = ?,
      extra_actions      = ?,
      extra_other_text   = ?,
      application_yesno  = ?,
      application_types  = ?,
      manager_comment    = ?,
      service_zone       = ?,
      meta_tabs          = ?
    WHERE id = ?
  `;

  db.run(
    sql,
    [
      String(primary.personal_account || '').trim(),
      JSON.stringify(primary.extra_actions),
      String(primary.extra_other_text || '').trim() || null,
      primary.application_yesno === null ? null : (primary.application_yesno ? 1 : 0),
      (primary.application_yesno ? JSON.stringify(primary.application_types) : null),
      String(primary.manager_comment || '').trim() || null,
      primary.service_zone ? 1 : 0,
      JSON.stringify(normalizedTabs),
      id
    ],
    (err) => {
      if (err) {
        console.error('DB error (updateMetaAppointment):', err);
        return res.status(500).json({ error: 'DB error (update meta)' });
      }
      if (!shouldComplete) {
        broadcast({ type: 'queue_updated' });
        return res.json({ ok: true });
      }
      db.run(
        `UPDATE queue SET status='completed', end_time=COALESCE(end_time, ?) WHERE id=?`,
        [now, id],
        (err2) => {
          if (err2) {
            console.error('DB error (updateMetaAppointment status):', err2);
            return res.status(500).json({ error: 'DB error (update status)' });
          }
          broadcast({ type: 'queue_updated' });
          res.json({ ok: true });
        }
      );
    }
  );
};

