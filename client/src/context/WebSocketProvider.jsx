import React, { createContext, useEffect, useRef, useState } from 'react';

export const WebSocketContext = createContext(null);

// Глобальний екземпляр, щоб уникнути дублюючих підключень (StrictMode/г.релоад)
let sharedSocket = null;
let subscribers = 0;

const WS_READY = {
  CONNECTING: 0,
  OPEN: 1,
};

const getSocket = (url) => {
  if (sharedSocket && [WS_READY.CONNECTING, WS_READY.OPEN].includes(sharedSocket.readyState)) {
    return sharedSocket;
  }
  sharedSocket = new WebSocket(url);
  return sharedSocket;
};

export const WebSocketProvider = ({ children, onMessage }) => {
  const [socket, setSocket] = useState(null);
  const suppressLogsRef = useRef(false);

  useEffect(() => {
    const WS_URL = import.meta.env.VITE_WS_URL;
    const ws = getSocket(WS_URL);
    subscribers += 1;

    if (ws.readyState === WS_READY.OPEN) {
      setSocket(ws);
    }

    ws.onopen = () => {
      console.log('✅ WebSocket підключено');
      setSocket(ws);
    };

    ws.onmessage = (event) => {
      onMessage?.(event.data);
    };

    ws.onerror = (error) => {
      if (suppressLogsRef.current) return; // не показуємо очікувані закриття
      console.error('⚠️ WS помилка:', error);
    };

    ws.onclose = () => {
      if (suppressLogsRef.current) return;
      console.log('⚠️ WS відключено');
      setSocket(null);
    };

    return () => {
      suppressLogsRef.current = true; // cleanup: не логувати закриття/помилку
      subscribers = Math.max(0, subscribers - 1);
      if (subscribers === 0 && ws.readyState <= WS_READY.OPEN) {
        ws.close();
        sharedSocket = null;
      }
    };
  }, [onMessage]);

  return (
    <WebSocketContext.Provider value={socket}>
      {children}
    </WebSocketContext.Provider>
  );
};
