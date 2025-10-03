const Employee = require('../models/Employee');
const bcrypt = require('bcrypt');
const moment = require('moment-timezone');
const { broadcast } = require('../ws');

exports.getAllEmployees = (req, res) => {
  Employee.getAll((err, rows) => {
    if (err) {
      console.error('Помилка при отриманні співробітників:', err);
      return res.status(500).json({ error: 'Помилка сервера' });
    }
    res.json(rows);
  });
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
  const { window_number, topics, schedule, priority } = req.body;

  if (!id) return res.status(400).json({ error: 'Не передано ID' });

  const query = `
    UPDATE employees
    SET window_number = ?, topics = ?, schedule = ?, priority = ?
    WHERE id = ?
  `;

  const values = [
    window_number || null,
    JSON.stringify(topics || []),
    JSON.stringify(schedule || {}),
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
