const db = require('../database');

class Question {
  static getAll(callback) {
    db.all('SELECT * FROM questions ORDER BY id ASC', callback);
  }

  static create({ text }, callback) {
    const query = 'INSERT INTO questions (text) VALUES (?)';
    db.run(query, [text], function (err) {
      callback(err, this?.lastID);
    });
  }

  static deleteById(id, callback) {
    const query = 'DELETE FROM questions WHERE id = ?';
    db.run(query, [id], callback);
  }
}

module.exports = Question;
