const settingsService = require('../services/settingsService');
const { broadcast } = require('../ws');

// === Допоміжна функція для валідації часу у форматі HH:MM ===
function parseTimeToMinutes(timeStr) {
  if (typeof timeStr !== 'string') return null;

  const trimmed = timeStr.trim();

  // Формат HH:MM
  const match = /^(\d{2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

// ==================================
//        ALARM (як було)
// ==================================

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

// ==================================
//        LUNCH (нові ендпоінти)
// ==================================

// GET /settings/lunch
// Повертає:
// { start: "13:00", end: "13:30" }
// або { start: null, end: null }, якщо ще не налаштовано
exports.getLunchSettings = (req, res) => {
  settingsService.getSetting('lunch_start', (err, startValue) => {
    if (err) {
      console.error('❌ Помилка отримання lunch_start з settings:', err);
      return res.status(500).json({ error: 'Помилка сервера' });
    }

    settingsService.getSetting('lunch_end', (err2, endValue) => {
      if (err2) {
        console.error('❌ Помилка отримання lunch_end з settings:', err2);
        return res.status(500).json({ error: 'Помилка сервера' });
      }

      res.json({
        start: startValue || null,
        end: endValue || null,
      });
    });
  });
};

// PATCH /settings/lunch
// Очікує тіло:
// { start: "13:00", end: "13:30" }
exports.setLunchSettings = (req, res) => {
  let { start, end } = req.body;

  // Перевірка типів
  if (typeof start !== 'string' || typeof end !== 'string') {
    return res.status(400).json({
      error: 'Поля start та end мають бути рядками у форматі HH:MM',
    });
  }

  start = start.trim();
  end = end.trim();

  // Парсимо в хвилини
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);

  if (startMinutes === null || endMinutes === null) {
    return res.status(400).json({
      error: 'Невірний формат часу. Використовуйте формат HH:MM (наприклад, 13:00).',
    });
  }

  if (endMinutes <= startMinutes) {
    return res.status(400).json({
      error: 'Кінець обіду має бути пізніше за початок.',
    });
  }

  // Спочатку зберігаємо lunch_start, потім lunch_end
  settingsService.setSetting('lunch_start', start, (err) => {
    if (err) {
      console.error('❌ Помилка збереження lunch_start в settings:', err);
      return res.status(500).json({ error: 'Помилка сервера при збереженні lunch_start' });
    }

    settingsService.setSetting('lunch_end', end, (err2) => {
      if (err2) {
        console.error('❌ Помилка збереження lunch_end в settings:', err2);
        return res.status(500).json({ error: 'Помилка сервера при збереженні lunch_end' });
      }

      // Можемо повідомити всі фронтенди через WebSocket
      broadcast({
        type: 'lunch_updated',
        start,
        end,
      });

      res.json({ success: true });
    });
  });
};
