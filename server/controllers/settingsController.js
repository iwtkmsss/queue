const settingsService = require('../services/settingsService');
const { broadcast } = require('../ws');

// GET /settings/alarm
exports.getAlarmStatus = (req, res) => {
  settingsService.getSetting('alarm_active', (err, value) => {
    if (err) return res.status(500).json({ error: 'Помилка сервера' });
    res.json({ value: value === 'true' });
  });
};

// PATCH /settings/alarm
exports.setAlarmStatus = (req, res) => {
  const { value } = req.body;

  if (typeof value !== 'string') {
    return res.status(400).json({ error: 'value має бути рядком' });
  }

  settingsService.setSetting('alarm_active', value, (err) => {
    if (err) return res.status(500).json({ error: 'Помилка сервера' });

    broadcast({ type: 'alarm_updated', value });
    res.json({ success: true });
  });
};
