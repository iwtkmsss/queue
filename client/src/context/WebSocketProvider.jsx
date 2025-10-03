import React, { createContext, useEffect, useRef, useState } from 'react';

export const WebSocketContext = createContext(null);

export const WebSocketProvider = ({ children, onMessage }) => {
  const socketRef = useRef(null);
  const [socket, setSocket] = useState(null); // 👈 Це буде в контексті

  useEffect(() => {
    const WS_URL = import.meta.env.VITE_WS_URL;
    const socketInstance = new WebSocket(WS_URL);
    socketRef.current = socketInstance;

    socketInstance.onopen = () => {
      console.log('✅ WebSocket підключено');
      setSocket(socketInstance); // 👈 Тільки після open!
    };

    socketInstance.onmessage = (event) => {
      console.log('📩 WS повідомлення:', event.data);
      onMessage?.(event.data);
    };

    socketInstance.onerror = (error) => {
      console.error('❌ WS помилка:', error);
    };

    socketInstance.onclose = () => {
      console.log('🔌 WS відключено');
    };

    return () => {
      socketInstance.close();
    };
  }, []);

  return (
    <WebSocketContext.Provider value={socket}>
      {children}
    </WebSocketContext.Provider>
  );
};

