const express = require('express');
const cors = require('cors');
const db = require('./database'); 
const scheduleDailyCleanup = require('./utils/cleanOldSchedules');
const { deferWaitingClientsEveryMinute } = require('./utils/alarmDeferrer');

// Імпорти роутів
const employeesRouter = require('./routes/employees');
const authRouter = require('./routes/auth');
const questionsRouter = require('./routes/questions');
const queueRouter = require('./routes/queue');
const settingsRouter = require('./routes/settings');
const appointmentsRouter = require('./routes/appointments');

// Імпорт WebSocket
const { initWebSocket } = require('./ws');

const app = express();

app.set('db', db); 

// Налаштування сервера
app.use(cors());
app.use(express.json());

// Підключення роутів
app.use('/settings', settingsRouter);
app.use('/employees', employeesRouter);
app.use('/auth', authRouter);
app.use('/questions', questionsRouter);
app.use('/queue', queueRouter);
app.use('/appointments', appointmentsRouter);

// Запуск сервера
const server = app.listen(5000, '0.0.0.0', () => {
  const address = server.address();
  const host = address.address === '::' ? 'localhost' : address.address;
  console.log(`🚀 Сервер запущений на http://${host}:${address.port}`);
});

// Запуск WebSocket-сервера
initWebSocket(server);

deferWaitingClientsEveryMinute();
scheduleDailyCleanup();

module.exports = app;
