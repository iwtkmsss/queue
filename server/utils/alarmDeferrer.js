const db = require('../database');

function deferWaitingClientsEveryMinute() {
  setInterval(async () => {
    try {
      const row = await db.getAsync(`SELECT value FROM settings WHERE key = 'alarm_active'`);
      if (row?.value !== 'true') return;

      await db.runAsync(`
        UPDATE queue
        SET appointment_time = DATETIME(appointment_time, '+1 minute')
        WHERE status = 'waiting'
      `);
    } catch (err) {
      console.error('❌ Alarm deferral error:', err);
    }
  }, 60000); // кожну хвилину
}

module.exports = { deferWaitingClientsEveryMinute };
