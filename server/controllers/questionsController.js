const Question = require('../models/Question');
const { broadcast } = require('../ws');

exports.getAllQuestions = (req, res) => {
  Question.getAll((err, questions) => {
    if (err) {
      console.error('Помилка отримання питань:', err);
      return res.status(500).json({ error: 'Помилка сервера' });
    }
    res.json(questions);
  });
};

exports.createQuestion = (req, res) => {
  const { text } = req.body;

  Question.create({ text }, (err, id) => {
    if (err) {
      console.error('Помилка створення питання:', err);
      return res.status(500).json({ error: 'Помилка сервера' });
    }
    broadcast({ type: 'queue_updated' });
    console.log('🔴 broadcast sent after question change');
    res.status(201).json({ id });
  });
};

exports.deleteQuestion = (req, res) => {
  const db = req.app.get('db');
  const { id } = req.params;

  db.run(`DELETE FROM questions WHERE id = ?`, [id], function (err) {
    if (err) return res.status(500).json({ error: 'DB error (delete question)' });

    // Видалити question ID з topics у всіх employees
    db.all(`SELECT id, topics FROM employees`, [], (err2, rows) => {
      if (err2) return res.status(500).json({ error: 'DB error (read employees)' });

      rows.forEach(emp => {
        try {
          const topics = JSON.parse(emp.topics || '[]');
          const updated = topics.filter(tid => tid !== Number(id));
          if (topics.length !== updated.length) {
            db.run(`UPDATE employees SET topics = ? WHERE id = ?`, [JSON.stringify(updated), emp.id]);
          }
        } catch (parseErr) {
          console.error('❌ JSON parse error in topics:', parseErr);
        }
      });

      res.json({ success: true });
    });
  });
};

