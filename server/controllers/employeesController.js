const Employee = require('../models/Employee');
const bcrypt = require('bcrypt');
const moment = require('moment-timezone');
const { broadcast } = require('../ws');
const scheduleService = require('../services/scheduleService');

const computeEmployeeStatuses = async (db, employees) => {
  const now = moment().tz('Europe/Kyiv');
  const today = now.format('YYYY-MM-DD');
  const scheduleMap = await scheduleService.getSchedulesForEmployees(employees, today);

  const lunchStartRow = await db.getAsync("SELECT value FROM settings WHERE key = 'lunch_start'");
  const lunchEndRow = await db.getAsync("SELECT value FROM settings WHERE key = 'lunch_end'");

  const lunchStart = lunchStartRow?.value
    ? moment.tz(`${today} ${lunchStartRow.value}`, 'YYYY-MM-DD HH:mm', 'Europe/Kyiv')
    : null;
  const lunchEnd = lunchEndRow?.value
    ? moment.tz(`${today} ${lunchEndRow.value}`, 'YYYY-MM-DD HH:mm', 'Europe/Kyiv')
    : null;

  const active = await db.allAsync(
    `SELECT window_id FROM queue 
     WHERE DATE(appointment_time) = ? AND status = 'in_progress'`,
    [today]
  );
  const activeByWindow = new Set(active.filter(r => r.window_id).map(r => r.window_id));

  return employees.map((emp) => {
    const todaySchedule = scheduleMap.get(emp.id) || null;

    const hasSchedule = todaySchedule?.start && todaySchedule?.end;
    const workingNow =
      hasSchedule &&
      now.isSameOrAfter(moment.tz(`${today} ${todaySchedule.start}`, 'YYYY-MM-DD HH:mm', 'Europe/Kyiv')) &&
      now.isBefore(moment.tz(`${today} ${todaySchedule.end}`, 'YYYY-MM-DD HH:mm', 'Europe/Kyiv'));

    const inLunch =
      workingNow &&
      lunchStart &&
      lunchEnd &&
      now.isSameOrAfter(lunchStart) &&
      now.isBefore(lunchEnd);

    const servingNow = emp.window_number && activeByWindow.has(emp.window_number);

    let status = 'Не працює';
    if (workingNow) status = 'Працює';
    if (inLunch) status = 'На обіді';
    if (servingNow) status = 'Обслуговує';

    return { ...emp, computed_status: status, status };
  });
};

exports.getAllEmployees = async (req, res) => {
  try {
    const db = req.app.get('db');
    const rows = await new Promise((resolve, reject) =>
      Employee.getAll((err, data) => (err ? reject(err) : resolve(data)))
    );
    const withStatuses = await computeEmployeeStatuses(db, rows);
    res.json(withStatuses);
  } catch (err) {
    console.error('Помилка при отриманні співробітників:', err);
    res.status(500).json({ error: 'Помилка сервера' });
  }
};

exports.addEmployee = async (req, res) => {
  const { name, position, password } = req.body;

  if (!name || !position || !password) {
    return res.status(400).json({ error: 'Імʼя, посада та пароль обовʼязкові' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const created_at = moment().tz('Europe/Kiev').format('YYYY-MM-DD HH:mm:ss');

    Employee.add({ name, position, passwordHash, created_at }, (err, id) => {
      if (err) {
        console.error('Помилка при додаванні співробітника:', err);
        return res.status(500).json({ error: 'Помилка при додаванні співробітника' });
      }
      res.status(201).json({ id, name, position });
    });
  } catch (err) {
    console.error('Помилка хешування пароля:', err);
    res.status(500).json({ error: 'Помилка при додаванні співробітника' });
  }
};

exports.updateStatus = (req, res) => {
  const { id, status } = req.body;

  Employee.updateStatus({ id, status }, (err) => {
    if (err) {
      console.error('Помилка оновлення статусу працівника:', err);
      return res.status(500).json({ error: 'Помилка оновлення статусу' });
    }
    res.status(200).json({ message: 'Статус оновлено' });
  });
};

exports.updateEmployee = (req, res) => {
  const { id } = req.params;
  const { window_number, topics, priority } = req.body;

  if (!id) return res.status(400).json({ error: 'Не передано ID' });

  const query = `
    UPDATE employees
    SET window_number = ?, topics = ?, priority = ?
    WHERE id = ?
  `;

  const values = [
    window_number || null,
    JSON.stringify(topics || []),
    priority || 0,
    id,
  ];

  req.app.get('db').run(query, values, function (err) {
    if (err) {
      console.error('❌ Помилка оновлення співробітника:', err);
      return res.status(500).json({ error: 'Помилка сервера при оновленні' });
    }

    broadcast({ type: 'queue_updated' });
    
    res.status(200).json({ message: 'Дані оновлено' });
  });
};

exports.deleteEmployee = (req, res) => {
  const db = req.app.get('db');
  const { id } = req.params;

  if (!id) return res.status(400).json({ error: 'Не вказано ID' });

  db.run('DELETE FROM employees WHERE id = ?', [id], function (err) {
    if (err) {
      console.error('❌ Помилка при видаленні працівника:', err);
      return res.status(500).json({ error: 'Помилка сервера при видаленні' });
    }

    res.status(200).json({ message: 'Працівника видалено' });
  });
};
