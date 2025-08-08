const db = require('../database');

function getMondayISOString(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

function cleanOldSchedules() {
  const monday = getMondayISOString();

  db.all('SELECT id, schedule FROM employees', (err, rows) => {
    if (err) {
      console.error('Помилка отримання працівників:', err);
      return;
    }

    rows.forEach(({ id, schedule }) => {
      if (!schedule) return;

      let parsed;
      try {
        parsed = JSON.parse(schedule);
      } catch {
        return;
      }

      const cleaned = Object.fromEntries(
        Object.entries(parsed).filter(([date]) => date >= monday)
      );

      db.run('UPDATE employees SET schedule = ? WHERE id = ?', [JSON.stringify(cleaned), id]);
    });

    console.log('✅ [schedule] Очистка завершена:', new Date().toLocaleString('uk-UA'));
  });
}

function scheduleDailyCleanup() {
  // 🟢 Одразу при старті
  cleanOldSchedules();

  // 🔁 Потім раз на 24 години
  setInterval(cleanOldSchedules, 24 * 60 * 60 * 1000); // 86 400 000 мс
}

module.exports = scheduleDailyCleanup;
