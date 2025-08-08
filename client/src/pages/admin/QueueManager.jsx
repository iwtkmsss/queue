import React, { useEffect, useState, useContext } from 'react';
import './QueueManager.css';
import { useError } from '../../context/ErrorContext';
import { WebSocketContext } from '../../context/WebSocketProvider';

const API_URL = import.meta.env.VITE_API_URL;
const LIMIT = 50;

const statusClassMap = {
  waiting: 'status-waiting',
  in_progress: 'status-inprogress',
  completed: 'status-completed',
  missed: 'status-missed',
  did_not_appear: 'status-didnotappear'
};

const QueueManager = () => {
  const [queue, setQueue] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [windowFrom, setWindowFrom] = useState('');
  const [windowTo, setWindowTo] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [newWindow, setNewWindow] = useState('');
  const { showError } = useError();

  const socket = useContext(WebSocketContext);

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

  const fetchTotalCount = async () => {
    try {
      const res = await fetch(`${API_URL}/queue/count`);
      const data = await res.json();
      setTotalPages(Math.ceil(data.count / LIMIT));
    } catch (err) {
      console.error('Помилка при отриманні загальної кількості:', err);
    }
  };

  const handleBulkRedirect = async () => {
    if (!windowFrom || !windowTo || isNaN(windowFrom) || isNaN(windowTo)) {
      showError('❗ Введіть коректні номери вікон');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/queue/move-window`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: parseInt(windowFrom),
          to: parseInt(windowTo)
        })
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

  const handleUpdate = async (id) => {
    try {
      const res = await fetch(`${API_URL}/queue/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ window_id: newWindow })
      });

      if (res.ok) {
        setEditingId(null);
        fetchQueue(page);
      } else {
        showError('❌ Помилка при оновленні запису');
      }
    } catch (err) {
      console.error('Помилка при оновленні:', err);
    }
  };

  useEffect(() => {
    fetchTotalCount();
  }, []);

  useEffect(() => {
    fetchQueue(page);
  }, [page]);

  useEffect(() => {
  if (!socket) return;

  const handleMessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'queue_updated') {
        setPage(1);
        fetchQueue(1);
      }
    } catch (err) {
      console.error('⛔️ WebSocket error in QueueManager:', err);
    }
  };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket]);


  const handlePageChange = (newPage) => {
    setPage(newPage);
  };

  const handleEdit = (id, currentWindow) => {
    setEditingId(id);
    setNewWindow(currentWindow);
  };

  return (
    <div className="queue-manager">
      <div className="queue-bulk-transfer">
        <h3>🔁 Переадресація вікон</h3>
        <input type="number" placeholder="З вікна..." value={windowFrom} onChange={(e) => setWindowFrom(e.target.value)} />
        <input type="number" placeholder="На вікно..." value={windowTo} onChange={(e) => setWindowTo(e.target.value)} />
        <button onClick={handleBulkRedirect}>🔁 Переадресувати</button>
      </div>

      <h2>📋 Черга</h2>

      <div className="queue-pagination">
        {Array.from({ length: totalPages }, (_, i) => (
          <button key={i} className={i + 1 === page ? 'active' : ''} onClick={() => handlePageChange(i + 1)}>
            {i + 1}
          </button>
        ))}
      </div>

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
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
            });
            const statusClass = statusClassMap[item.status] || '';

            return (
              <tr key={item.id} className={statusClass}>
                <td>{item.id}</td>
                <td>{formatted}</td>
                <td>{item.question_text}</td>
                <td>
                  {editingId === item.id ? (
                    <input type="number" value={newWindow} onChange={(e) => setNewWindow(e.target.value)} />
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

      {isLoading && <p style={{ padding: '10px' }}>Завантаження...</p>}
    </div>
  );
};

export default QueueManager;
