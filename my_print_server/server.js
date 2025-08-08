const express = require('express');
const { printTicket } = require('./printService.js');

const app = express();
const PORT = 5001;

app.use(express.json());

app.post('/print-ticket', (req, res) => {
  const { number, date, time } = req.body;

  printTicket(number, date, time);

  res.json({ success: true, message: 'Друк запущено!' });
});

app.listen(PORT, () => {
  console.log(`Локальний сервер працює на http://localhost:${PORT}`);
});
