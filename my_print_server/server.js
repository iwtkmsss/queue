// server.js
import express from 'express';
import cors from 'cors';
import { printTestPage, printTicket } from './printService.js';

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Лог старту сервера
console.log('🚀 [server] Ініціалізація сервера друку...');

app.get('/', (req, res) => {
  console.log('🌐 [server] GET /  — перевірка стану сервера');
  res.send('Print server for CUSTOM TG2480-H is running');
});

/**
 * Тестовий талон (готові тестові дані з printService)
 * POST /print/test
 * body (опц.): { "printer": "Імʼя принтера" }
 */
app.post('/print/test', async (req, res) => {
  console.log('🌐 [server] POST /print/test — отримано запит');
  console.log('📦 [server] Body:', req.body);

  try {
    const printerName = req.body?.printer || 'CUSTOM TG2480-H';
    console.log('🖨 [server] Виклик printTestPage для принтера:', printerName);

    await printTestPage(printerName);

    console.log('✅ [server] Тестовий талон успішно відправлено на друк.');

    res.json({
      success: true,
      message: 'Тестовий талон відправлено на друк',
    });
  } catch (err) {
    console.error('❌ [server] Помилка друку тестового талону:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * Друк реального талону
 * POST /print/ticket
 *
 * body:
 * {
 *   "printer": "CUSTOM TG2480-H",   // опційно
 *   "ticketNumber": "A123",
 *   "windowNumber": "5",            // опційно
 *   "questionText": "Перерахунок показників",
 *   "dateTime": "2025-11-18 15:20", // опційно, за замовчуванням now
 *   "extraLine": "Електронна черга",
 *   "footerText": "Дякуємо за звернення!"
 * }
 */
app.post('/print/ticket', async (req, res) => {
  console.log('🌐 [server] POST /print/ticket — отримано запит');
  console.log('📦 [server] Body:', req.body);

  try {
    const {
      printer,
      ticketNumber,
      windowNumber,
      questionText,
      dateTime,
      extraLine,
      footerText,
    } = req.body || {};

    const printerName = printer || 'CUSTOM TG2480-H';

    const ticketData = {
      ticketNumber: ticketNumber || 'A001',
      windowNumber: windowNumber || null,
      questionText: questionText || 'Питання не вказано',
      dateTime: dateTime || new Date().toLocaleString('uk-UA'),
      extraLine: extraLine || '',
      footerText:
        footerText || 'Зберігайте талон до завершення обслуговування.',
    };

    console.log('🖨 [server] Виклик printTicket з параметрами:');
    console.log('   ↳ Принтер:', printerName);
    console.log('   ↳ Дані талону:', ticketData);

    await printTicket(printerName, ticketData);

    console.log('✅ [server] Талон успішно відправлено на друк.');

    res.json({
      success: true,
      message: 'Талон відправлено на друк',
      data: ticketData,
    });
  } catch (err) {
    console.error('❌ [server] Помилка друку талону:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`✅ [server] Print server is running on http://localhost:${PORT}`);
});
