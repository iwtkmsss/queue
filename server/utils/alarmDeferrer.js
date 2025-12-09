const moment = require('moment-timezone');
const db = require('../database');
const { broadcast } = require('../ws');

function deferWaitingClientsEveryMinute() {
  setInterval(async () => {
    try {
      const row = await db.getAsync(`SELECT value FROM settings WHERE key = 'alarm_active'`);
      const alarmActive = row?.value === 'true';
      if (!alarmActive) return;

      const nowKyiv = moment().tz('Europe/Kyiv').format('YYYY-MM-DD HH:mm:ss');
      const result = await db.runAsync(
        `
        UPDATE queue
        SET status = 'alarm_missed'
        WHERE status = 'waiting'
          AND appointment_time <= ?
        `,
        [nowKyiv]
      );

      if (result?.changes) {
        broadcast({ type: 'queue_updated' });
      }
    } catch (err) {
      console.error('Alarm deferral error:', err);
    }
  }, 60000); // run every minute
}

module.exports = { deferWaitingClientsEveryMinute };
