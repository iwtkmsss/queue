import React, { useEffect, useState, useContext } from 'react';
import './admin/QueueManager.css';
import './Dispatcher.css';
import { WebSocketContext } from '../context/WebSocketProvider.jsx';
import { useError } from '../context/ErrorContext.jsx';

const API_URL = import.meta.env.VITE_API_URL;
const LIMIT = 50;

const statusClassMap = {
  waiting: 'status-waiting',
  in_progress: 'status-inprogress',
  completed: 'status-completed',
  missed: 'status-missed',
  did_not_appear: 'status-didnotappear'
};

const Dispatcher = () => {
  const [queue, setQueue] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [newWindow, setNewWindow] = useState('');
  const [windowFrom, setWindowFrom] = useState('');
  const [windowTo, setWindowTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [authorized, setAuthorized] = useState(false);
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const { showError } = useError();

  const socket = useContext(WebSocketContext);

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'queue_updated') {
        console.log('🔔 Оновлення черги');
        fetchQueue();
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket]);

  const fetchQueue = async (pageNum = 1) => {
    setIsLoading(true);
    try {
      const offset = (pageNum - 1) * LIMIT;
      const res = await fetch(`${API_URL}/queue?limit=${LIMIT}&offset=${offset}`);
      const data = await res.json();
      setQueue(data.rows);
      setTotalPages(Math.ceil(data.total / LIMIT));
    } catch (err) {
      console.error('Помилка при завантаженні черги:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (authorized) {
      fetchQueue(page);
    }
  }, [page, authorized]);

  const handleEdit = (id, currentWindow) => {
    setEditingId(id);
    setNewWindow(currentWindow);
  };
  
  const handleLogout = () => {
    setAuthorized(false);
    setName('');
    setPassword('');
  };

  const handleUpdate = async (id) => {
    try {
      const res = await fetch(`${API_URL}/queue/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ window_id: newWindow }),
      });
      if (res.ok) {
        setEditingId(null);
        fetchQueue(page);
      } else {
        console.error('Помилка при оновленні вікна');
      }
    } catch (err) {
      console.error('Помилка при оновленні:', err);
    }
  };

  const handleBulkRedirect = async () => {
    if (!windowFrom || !windowTo || isNaN(windowFrom) || isNaN(windowTo)) {
      showError('❗ Введіть коректні номери вікон');
      return;
    }

    try {
      const body = JSON.stringify({
        from: parseInt(windowFrom),
        to: parseInt(windowTo)
      });

      const res = await fetch(`${API_URL}/queue/move-window`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body
      });

      const result = await res.json();

      if (res.ok) {
        showError(`✅ Переадресацію виконано. Переміщено: ${result.moved}`);
        fetchQueue(page);
      } else {
        showError(`❌ Помилка: ${result.error || 'невідома'}`);
      }
    } catch (err) {
      console.error('❌ Помилка при PATCH:', err);
      showError('❌ Помилка при надсиланні запиту');
    }
  };

  const handleLogin = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password, expectedPosition: 'Диспетчер' }),
      });

      const data = await res.json();
      console.log('[LOGIN RESPONSE]', data);
      
      if (res.ok) {
        setAuthorized(true);
        fetchQueue(page);
      } else {
        showError('❌ Невірний логін або недостатньо прав');
      }
    } catch (err) {
      showError('❌ Помилка при вході');
      console.error('Login error:', err);
    }
  };

  if (!authorized) {
    return (
      <div className="dispatcher-login">
        <h2>🔐 Вхід в диспетчерську</h2>
        <input
          type="text"
          placeholder="Логін"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button onClick={handleLogin}>Увійти</button>
      </div>
    );
  }

  return (
    <div className="queue-manager">
      <div style={{ textAlign: 'right', marginBottom: '10px' }}>
        <button onClick={handleLogout}>🚪 Вийти</button>
      </div>
      <div className="queue-bulk-transfer">
        <h3>🔁 Переадресація вікон</h3>
        <input
          type="number"
          placeholder="З вікна..."
          style={{ width: '100px', marginRight: '10px' }}
          value={windowFrom}
          onChange={(e) => setWindowFrom(e.target.value)}
        />
        <input
          type="number"
          placeholder="На вікно..."
          style={{ width: '100px', marginRight: '10px' }}
          value={windowTo}
          onChange={(e) => setWindowTo(e.target.value)}
        />
        <button onClick={handleBulkRedirect}>🔁 Переадресувати</button>
      </div>

      <h2>📋 Черга</h2>
      <table className="queue-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Дата та час</th>
            <th>Питання</th>
            <th>Вікно</th>
            <th>Статус</th>
            <th>Дії</th>
          </tr>
        </thead>
        <tbody>
          {queue.map((item) => {
            const formatted = new Date(item.appointment_time).toLocaleString('uk-UA', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });
            const statusClass = statusClassMap[item.status] || '';

            return (
              <tr key={item.id} className={statusClass}>
                <td>{item.id}</td>
                <td>{formatted}</td>
                <td>{item.question_text}</td>
                <td>
                  {editingId === item.id ? (
                    <input
                      type="number"
                      value={newWindow}
                      onChange={(e) => setNewWindow(e.target.value)}
                      style={{ width: '60px' }}
                    />
                  ) : (
                    item.window_id || '-'
                  )}
                </td>
                <td>{item.status}</td>
                <td>
                  {editingId === item.id ? (
                    <>
                      <button onClick={() => handleUpdate(item.id)}>💾 Зберегти</button>
                      <button onClick={() => setEditingId(null)}>❌ Скасувати</button>
                    </>
                  ) : (
                    <button onClick={() => handleEdit(item.id, item.window_id)}>✏️ Змінити</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="queue-pagination">
        {Array.from({ length: totalPages }, (_, i) => (
          <button
            key={i + 1}
            onClick={() => setPage(i + 1)}
            className={page === i + 1 ? 'active' : ''}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {isLoading && <p style={{ padding: '10px' }}>Завантаження...</p>}
    </div>
  );
};

export default Dispatcher;
