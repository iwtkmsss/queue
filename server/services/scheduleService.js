const moment = require('moment-timezone');
const db = require('../database');

function isoWeekStart(dateStr) {
  const m = moment.tz(dateStr, 'YYYY-MM-DD', true, 'Europe/Kyiv');
  if (!m.isValid()) return null;
  return m.clone().startOf('isoWeek').format('YYYY-MM-DD');
}

function validateDayData(day) {
  if (!day) return null;
  const { start, end } = day;
  if (typeof start !== 'string' || typeof end !== 'string') return null;
  const matchStart = /^(\d{2}):(\d{2})$/.exec(start.trim());
  const matchEnd = /^(\d{2}):(\d{2})$/.exec(end.trim());
  if (!matchStart || !matchEnd) return null;
  const s = Number(matchStart[1]) * 60 + Number(matchStart[2]);
  const e = Number(matchEnd[1]) * 60 + Number(matchEnd[2]);
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return null;
  return { start: start.trim(), end: end.trim() };
}

async function getScheduleForDate(employeeId, dateStr) {
  const weekStart = isoWeekStart(dateStr);
  if (!weekStart) return null;
  const day = moment.tz(dateStr, 'YYYY-MM-DD', true, 'Europe/Kyiv').isoWeekday(); // 1..7

  const row = await db.getAsync(
    `
      SELECT data
      FROM work_schedules
      WHERE employee_id = ?
        AND week_start = ?
        AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [employeeId, weekStart]
  );
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.data || '{}');
    return parsed[String(day)] || parsed[day] || null;
  } catch {
    return null;
  }
}

async function getSchedulesForEmployees(employees, dateStr) {
  const weekStart = isoWeekStart(dateStr);
  if (!weekStart || !Array.isArray(employees) || employees.length === 0) return new Map();
  const ids = employees.map((e) => e.id).filter(Boolean);
  if (!ids.length) return new Map();

  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.allAsync(
    `
    SELECT employee_id, data
    FROM work_schedules
    WHERE week_start = ?
      AND status = 'active'
      AND employee_id IN (${placeholders})
    `,
    [weekStart, ...ids]
  );
  const map = new Map();
  const day = moment.tz(dateStr, 'YYYY-MM-DD', true, 'Europe/Kyiv').isoWeekday();
  rows.forEach((row) => {
    try {
      const parsed = JSON.parse(row.data || '{}');
      const d = parsed[String(day)] || parsed[day] || null;
      map.set(row.employee_id, d);
    } catch {
      // ignore
    }
  });
  return map;
}

async function createWeeklySchedule({ employee_id, week_start, data, created_by = null, note = null, supersedes_id = null }) {
  const weekStart = isoWeekStart(week_start);
  if (!weekStart) throw new Error('INVALID_WEEK_START');

  const normalized = {};
  Object.entries(data || {}).forEach(([day, val]) => {
    const valid = validateDayData(val);
    if (valid) normalized[String(day)] = valid;
  });
  if (Object.keys(normalized).length === 0) throw new Error('EMPTY_SCHEDULE');

  // Архівуємо попередній активний
  await db.runAsync(
    `UPDATE work_schedules SET status = 'archived' WHERE employee_id = ? AND week_start = ? AND status = 'active'`,
    [employee_id, weekStart]
  );

  const res = await db.runAsync(
    `
    INSERT INTO work_schedules (employee_id, week_start, data, status, created_by, note, supersedes_id)
    VALUES (?, ?, ?, 'active', ?, ?, ?)
    `,
    [employee_id, weekStart, JSON.stringify(normalized), created_by, note || null, supersedes_id || null]
  );
  return { id: res.lastID, employee_id, week_start: weekStart, data: normalized };
}

async function listSchedules({ employee_id, from, to, status }) {
  const clauses = [];
  const params = [];
  if (employee_id) {
    clauses.push('employee_id = ?');
    params.push(employee_id);
  }
  if (from) {
    clauses.push('date(week_start) >= date(?)');
    params.push(from);
  }
  if (to) {
    clauses.push('date(week_start) <= date(?)');
    params.push(to);
  }
  if (status) {
    clauses.push('status = ?');
    params.push(status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await db.allAsync(
    `
    SELECT * FROM work_schedules
    ${where}
    ORDER BY date(week_start) DESC, id DESC
    `,
    params
  );
  return rows;
}

module.exports = {
  isoWeekStart,
  getScheduleForDate,
  getSchedulesForEmployees,
  createWeeklySchedule,
  listSchedules,
};
