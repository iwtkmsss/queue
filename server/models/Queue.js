const db = require('../database');

class Queue {
  static create({ customer_name, question_id, window_id, ticket_number, appointment_time }, callback) {
    const query = `
      INSERT INTO queue (customer_name, question_id, window_id, ticket_number, appointment_time)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.run(query, [customer_name, question_id, window_id, ticket_number, appointment_time], function (err) {
      callback(err, this?.lastID);
    });
  }

  static updateStatus({ id, status }, callback) {
    const query = 'UPDATE queue SET status = ? WHERE id = ?';
    db.run(query, [status, id], callback);
  }

  static reassignWindow({ oldWindowId, newWindowId }, callback) {
    const query = 'UPDATE queue SET window_id = ? WHERE window_id = ? AND status = "Очікує"';
    db.run(query, [newWindowId, oldWindowId], callback);
  }

  static updateWindow(id, windowId, callback) {
    const query = 'UPDATE queue SET window_id = ? WHERE id = ?';
    db.run(query, [windowId, id], callback);
  }
  
  static getAll({ limit = 50, offset = 0 }, callback) {
    const countQuery = `SELECT COUNT(*) AS total FROM queue`;
    const dataQuery = `
      SELECT q.*, qu.text AS question_text
      FROM (
        SELECT * FROM queue
        ORDER BY CAST(id AS INTEGER) DESC
        LIMIT ? OFFSET ?
      ) q
      LEFT JOIN questions qu ON q.question_id = qu.id
    `;

    db.get(countQuery, [], (countErr, countRow) => {
      if (countErr) {
        console.error('❌ DB count error in getAll:', countErr);
        return callback(countErr);
      }

      db.all(dataQuery, [limit, offset], (err, rows) => {
        if (err) {
          console.error('❌ DB data error in getAll:', err);
          return callback(err);
        }

        callback(null, { rows, total: countRow.total });
      });
    });
  }
}

module.exports = Queue;
