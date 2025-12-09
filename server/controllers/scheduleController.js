const { isoWeekStart, getScheduleForDate, getSchedulesForEmployees, createWeeklySchedule, listSchedules } = require('../services/scheduleService');

exports.getScheduleForDate = async (req, res) => {
  try {
    const { employee_id, date } = req.query;
    if (!employee_id || !date) {
      return res.status(400).json({ error: 'employee_id і date обов\'язкові' });
    }
    const sched = await getScheduleForDate(Number(employee_id), date);
    res.json({ schedule: sched });
  } catch (err) {
    console.error('Schedule getForDate error:', err);
    res.status(500).json({ error: 'Помилка сервера' });
  }
};

exports.listSchedules = async (req, res) => {
  try {
    const { employee_id, from, to, status } = req.query;
    const rows = await listSchedules({
      employee_id: employee_id ? Number(employee_id) : undefined,
      from,
      to,
      status,
    });
    res.json(rows);
  } catch (err) {
    console.error('Schedule list error:', err);
    res.status(500).json({ error: 'Помилка сервера' });
  }
};

exports.createSchedule = async (req, res) => {
  try {
    const { employee_id, week_start, data, note, supersedes_id, created_by } = req.body || {};
    if (!employee_id || !week_start || !data) {
      return res.status(400).json({ error: 'employee_id, week_start і data обов\'язкові' });
    }
    const week = isoWeekStart(week_start);
    if (!week) {
      return res.status(400).json({ error: 'Невірний week_start, очікується YYYY-MM-DD (понеділок)' });
    }
    const created = await createWeeklySchedule({
      employee_id: Number(employee_id),
      week_start: week,
      data,
      note,
      created_by: created_by || null,
      supersedes_id: supersedes_id || null,
    });
    res.status(201).json(created);
  } catch (err) {
    console.error('Schedule create error:', err);
    if (err.message === 'INVALID_WEEK_START' || err.message === 'EMPTY_SCHEDULE') {
      return res.status(400).json({ error: 'Невірний формат розкладу' });
    }
    res.status(500).json({ error: 'Помилка сервера' });
  }
};
