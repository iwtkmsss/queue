import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ErrorProvider } from './context/ErrorContext';
import { WebSocketProvider } from './context/WebSocketProvider';

import Menu from './pages/Home';
import Manager from './pages/Manager';
import Queue from './pages/Queue';
import Admin from './pages/Admin';
import Dispatcher from './pages/Dispatcher';
import ShowQueue from './pages/Show_queue';

const API_URL = import.meta.env.VITE_API_URL;

function App() {
  useEffect(() => {
    const interval = setInterval(() => {
      (async () => {
        try {
          const res = await fetch(`${API_URL}/settings/service_minutes`);
          if (!res.ok) return;

          const { value } = await res.json();
          const durationMin = Number(value);
          if (isNaN(durationMin)) return;

          const deadline = new Date(Date.now() - (durationMin + 5) * 60000);
          if (isNaN(deadline.getTime())) return;

          const qRes = await fetch(`${API_URL}/queue`);
          if (!qRes.ok) return;

          const qData = await qRes.json();
          const queue = qData.rows;

          const toSkip = queue.filter(entry =>
            entry.status === 'waiting' &&
            new Date(entry.appointment_time) < deadline
          );

          await Promise.all(
            toSkip.map(entry =>
              fetch(`${API_URL}/appointments/${entry.id}/skip`, {
                method: 'POST'
              })
            )
          );
        } catch (err) {
          console.error('🟥 useEffect error:', err);
        }
      })();
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <WebSocketProvider onMessage={(msg) => console.log('📬 Вхідне WS:', msg)}>
      <ErrorProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Menu />} />
            <Route path="/manager" element={<Manager />} />
            <Route path="/queue" element={<Queue />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/dispatcher" element={<Dispatcher />} />
            <Route path="/show" element={<ShowQueue />} />
          </Routes>
        </Router>
      </ErrorProvider>
    </WebSocketProvider>
  );
}

export default App;
