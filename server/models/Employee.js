const db = require('../database');

class Employee {
  static getAll(callback) {
    db.all('SELECT * FROM employees ORDER BY created_at DESC', callback);
  }

  static add({ name, position, passwordHash, created_at }, callback) {
    const query = 'INSERT INTO employees (name, position, password, created_at) VALUES (?, ?, ?, ?)';
    db.run(query, [name, position, passwordHash, created_at], function (err) {
      callback(err, this?.lastID);
    });
  }

  static updateStatus({ id, status }, callback) {
    const query = 'UPDATE employees SET status = ? WHERE id = ?';
    db.run(query, [status, id], callback);
  }

  static findByName(name, callback) {
    const query = 'SELECT * FROM employees WHERE name = ?';
    db.get(query, [name], callback);
  }  
}

module.exports = Employee;
