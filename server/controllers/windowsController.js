const Window = require('../models/Window');

exports.getAllWindows = (req, res) => {
  Window.getAll((err, windows) => {
    if (err) {
      console.error('Помилка отримання вікон:', err);
      return res.status(500).json({ error: 'Помилка сервера' });
    }
    res.json(windows);
  });
};

exports.createWindow = (req, res) => {
  const { number, employee_name, topics, time_per_customer, work_time_from, work_time_to, active_until } = req.body;

  Window.create({ number, employee_name, topics, time_per_customer, work_time_from, work_time_to, active_until }, (err, id) => {
    if (err) {
      console.error('Помилка створення вікна:', err);
      return res.status(500).json({ error: 'Помилка сервера' });
    }
    res.status(201).json({ id });
  });
};

exports.updateWindowTopics = (req, res) => {
  const { id, topics } = req.body;

  Window.updateTopics({ id, topics }, (err) => {
    if (err) {
      console.error('Помилка оновлення тем вікна:', err);
      return res.status(500).json({ error: 'Помилка сервера' });
    }
    res.json({ message: 'Тематика вікна оновлена' });
  });
};
