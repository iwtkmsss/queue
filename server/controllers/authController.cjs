const Employee = require('../models/Employee');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const secretKey  = process.env.JWT_SECRET;

exports.login = (req, res) => {
  const { name, password, expectedPosition } = req.body;

  Employee.findByName(name, async (err, employee) => {
    if (err) {
      console.error('Помилка при пошуку працівника:', err);
      return res.status(500).json({ error: 'Помилка сервера' });
    }

    if (!employee) {
      return res.status(400).json({ error: 'Користувача не знайдено' });
    }

    if (expectedPosition && employee.position !== expectedPosition) {
      return res.status(403).json({ error: 'Недостатньо прав для входу' });
    }

    const isPasswordValid = await bcrypt.compare(password, employee.password);

    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Невірний пароль' });
    }

    const token = jwt.sign({ id: employee.id, role: employee.position }, secretKey, { expiresIn: '12h' });

    res.json({ token });
  });
};

exports.loginEmployee = (req, res) => {
  const db = req.app.get('db');
  const { name, password } = req.body;

  if (!name || !password) {
    return res.status(400).json({ error: 'Усі поля обовʼязкові' });
  }

  const sql = 'SELECT * FROM employees WHERE name = ? LIMIT 1';
  db.get(sql, [name], async (err, row) => {
    if (err) {
      console.error('❌ Помилка БД при вході:', err);
      return res.status(500).json({ error: 'Помилка бази даних' });
    }

    if (!row) {
      return res.status(401).json({ error: 'Користувача не знайдено' });
    }

    const match = await bcrypt.compare(password, row.password);
    if (!match) {
      return res.status(401).json({ error: 'Невірний пароль' });
    }

    // Очистимо чутливі поля
    delete row.password;

    try {
      row.topics = JSON.parse(row.topics || '[]');
    } catch {
      row.topics = [];
    }

    res.json(row);
  });
};

