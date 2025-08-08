const WebSocket = require('ws');

let wss; 

function initWebSocket(server) {
  wss = new WebSocket.Server({ server });

  wss.on('connection', (ws) => {
    console.log('🔌 Новий клієнт WebSocket підключився');

    ws.on('message', (message) => {
      console.log('📩 Отримано повідомлення від клієнта WS:', message.toString());
      // Тут можна обробляти повідомлення від клієнтів, якщо треба
    });

    ws.on('close', () => {
      console.log("❌ WebSocket-з'єднання закрито");
    });
  });
}

// Функція для відправки даних всім підключеним клієнтам
function broadcast(data) {
  if (!wss) return;

  const jsonData = JSON.stringify(data);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(jsonData);
    }
  });
}

module.exports = {
  initWebSocket,
  broadcast,
};
