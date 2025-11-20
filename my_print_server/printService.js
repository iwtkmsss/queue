// printService.js

// pdf-to-printer — CommonJS, тому імпортуємо так:
import pkg from 'pdf-to-printer';
const { print } = pkg;

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import os from 'os';

// 🔤 Кастомний шрифт з кирилицею (Windows)
const CUSTOM_FONT_PATH = 'C:/Windows/Fonts/arial.ttf';

// Розмір термострічки (80мм ширина)
const PAGE_WIDTH_MM = 80;
const PAGE_HEIGHT_MM = 200; // висоту можна підганяти
const MM_TO_PT = 2.83465;

const PAGE_WIDTH_PT = PAGE_WIDTH_MM * MM_TO_PT;
const PAGE_HEIGHT_PT = PAGE_HEIGHT_MM * MM_TO_PT;

/** 
 * Малює горизонтальну лінію-розділювач
 */ 
function drawSeparator(doc) {
  const margin = 10;
  const y = doc.y + 5;

  doc
    .moveTo(margin, y)
    .lineTo(PAGE_WIDTH_PT - margin, y)
    .lineWidth(0.5)
    .stroke();

  doc.moveDown(0.6);
}

/**
 * Створює PDF-файл талону.
 * @param {string} filePath - Куди зберегти PDF.
 * @param {object} data - Дані талону.
 */
function createTicketPdf(filePath, data) {
  console.log('📝 [printService] Створення PDF талону...');
  console.log('📝 [printService] Шлях до файлу:', filePath);
  console.log('📝 [printService] Дані талону:', data);

  return new Promise((resolve, reject) => {
    const {
      ticketNumber = 'A001',
      windowNumber = null, // може бути null, якщо ще не знаємо вікно
      questionText = 'Питання не вказано',
      dateTime = new Date().toLocaleString('uk-UA'),
      extraLine = '',
      footerText = 'Зберігайте талон до завершення обслуговування.',
    } = data || {};

    const doc = new PDFDocument({
      size: [PAGE_WIDTH_PT, PAGE_HEIGHT_PT],
      margins: { top: 10, left: 10, right: 10, bottom: 10 },
    });

    const stream = fs.createWriteStream(filePath);

    stream.on('finish', () => {
      console.log('✅ [printService] PDF талону створено успішно:', filePath);
      resolve();
    });

    stream.on('error', (err) => {
      console.error('❌ [printService] Помилка запису PDF у файл:', err);
      reject(err);
    });

    doc.pipe(stream);

    // Шрифт з кирилицею
    try {
      if (CUSTOM_FONT_PATH && fs.existsSync(CUSTOM_FONT_PATH)) {
        doc.font(CUSTOM_FONT_PATH);
        console.log('🔤 [printService] Підключено кастомний шрифт:', CUSTOM_FONT_PATH);
      } else {
        console.warn('⚠️ [printService] Кастомний шрифт не знайдено, використовую стандартний.');
      }
    } catch (e) {
      console.warn(
        '⚠️ [printService] Не вдалося підключити шрифт, буде стандартний (можливі проблеми з кирилицею):',
        e.message
      );
    }

    // 🔝 Шапка — назва компанії
    doc.fontSize(11).text('ТОВ «ЄВРО-РЕКОНСТРУКЦІЯ»', {
      align: 'center',
    });

    doc.moveDown(0.3);
    doc.fontSize(9).text('Електронна черга', {
      align: 'center',
    });

    drawSeparator(doc);

    // "ТАЛОН"
    doc.fontSize(10).text('ТАЛОН', {
      align: 'center',
    });

    doc.moveDown(0.2);

    // Великий номер талона
    doc.fontSize(32).text(ticketNumber, {
      align: 'center',
    });

    drawSeparator(doc);

    // Тип звернення
    doc.fontSize(9).text('Тип послуги:', {
      align: 'center',
    });

    doc.moveDown(0.2);

    doc.fontSize(10).text(questionText, {
      align: 'center',
    });

    if (extraLine) {
      doc.moveDown(0.3);
      doc.fontSize(9).text(extraLine, {
        align: 'center',
      });
    }

    drawSeparator(doc);

    // Якщо вікно вже відоме — виводимо
    if (windowNumber) {
      doc.fontSize(10).text(`Обслуговування: вікно № ${windowNumber}`, {
        align: 'center',
      });

      doc.moveDown(0.4);
    } else {
      doc.fontSize(9).text('Очікуйте свого номера на табло.', {
        align: 'center',
      });

      doc.moveDown(0.4);
    }

    // Дата та час
    doc.fontSize(9).text(dateTime, {
      align: 'center',
    });

    drawSeparator(doc);

    // Низ талону — інструкція / подяка
    doc.fontSize(8).text(footerText, {
      align: 'center',
    });

    doc.moveDown(0.4);
    doc
      .fontSize(8)
      .text('Будь ласка, зберігайте талон до завершення обслуговування.', {
        align: 'center',
      });

    doc.end();
  });
}

/**
 * Друк талону з даними
 * @param {string} printerName - Імʼя принтера в системі.
 * @param {object} ticketData - Дані талону.
 */
export async function printTicket(
  printerName = 'CUSTOM TG2480-H',
  ticketData = {}
) {
  const tmpDir = os.tmpdir();
  const pdfPath = path.join(tmpDir, `ticket-${Date.now()}.pdf`);

  console.log('🖨 [printService] ===== ПОЧАТОК ДРУКУ ТАЛОНУ =====');
  console.log('🖨 [printService] Імʼя принтера:', printerName);
  console.log('🖨 [printService] Тимчасовий PDF:', pdfPath);

  try {
    await createTicketPdf(pdfPath, ticketData);

    console.log('➡️ [printService] Відправка PDF на друк через pdf-to-printer...');
    await print(pdfPath, {
      printer: printerName,
    });
    console.log('✅ [printService] Друк талону завершено успішно.');
  } catch (err) {
    console.error('❌ [printService] Помилка під час друку талону:', err);
    throw err;
  } finally {
    // Чистимо тимчасовий файл
    fs.unlink(pdfPath, (err) => {
      if (err) {
        console.warn(
          '⚠️ [printService] Не вдалося видалити тимчасовий PDF:',
          err.message
        );
      } else {
        console.log('🧹 [printService] Тимчасовий PDF видалено:', pdfPath);
      }
    });

    console.log('🖨 [printService] ===== КІНЕЦЬ ДРУКУ ТАЛОНУ =====');
  }
}

/**
 * Тестовий талон — максимально схожий на звичайний бойовий
 */
export async function printTestPage(printerName = 'CUSTOM TG2480-H') {
  console.log('🧪 [printService] Запуск друку ТЕСТОВОГО талону...');
  const testData = {
    ticketNumber: 'A101',
    windowNumber: null, // як у реальній черзі — вікно ще не відоме
    questionText: 'Консультація з нарахування/оплати',
    dateTime: new Date().toLocaleString('uk-UA'),
    extraLine: 'Будь ласка, очікуйте виклику на табло.',
    footerText: 'Дякуємо за звернення до ТОВ «ЄВРО-РЕКОНСТРУКЦІЯ»!',
  };

  await printTicket(printerName, testData);
}
