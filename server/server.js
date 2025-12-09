const express = require('express');
const cors = require('cors');
const db = require('./database'); 
const { deferWaitingClientsEveryMinute } = require('./utils/alarmDeferrer');

// Імпорти роутів
const employeesRouter = require('./routes/employees');
const authRouter = require('./routes/auth');
const questionsRouter = require('./routes/questions');
const queueRouter = require('./routes/queue');
const settingsRouter = require('./routes/settings');
const appointmentsRouter = require('./routes/appointments');
const schedulesRouter = require('./routes/schedules');

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
app.use('/schedules', schedulesRouter);

const PORT = process.env.PORT || 5000;
const HOST = "127.0.0.1";

// Запуск сервера
const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running at http://${HOST}:${PORT}`);
});

// Запуск WebSocket-сервера
initWebSocket(server);

deferWaitingClientsEveryMinute();

module.exports = app;
