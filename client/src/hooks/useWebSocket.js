import { useEffect } from 'react';

const useWebSocket = (onMessage) => {
  useEffect(() => {
    if (!import.meta.env.VITE_WS_URL) return;

    const socket = new WebSocket(import.meta.env.VITE_WS_URL);

    let isConnected = false;

    socket.onopen = () => {
      console.log('✅ Підключено до WebSocket сервера');
      isConnected = true;
    };

    socket.onerror = (error) => {
      if (!isConnected) {
        console.error('❌ WebSocket не вдалося підключити:', error);
      }
    };

    socket.onclose = () => {
      console.log('🔌 WebSocket-зʼєднання закрите');
    };

    socket.onmessage = (event) => {
      console.log('📩 Отримано повідомлення через WS:', event.data);
      onMessage?.(event.data);
    };

    return () => {
      socket.close();
    };
  }, [onMessage]);
};

export default useWebSocket;
