import React, { useEffect, useState, useContext } from 'react';
import moment from 'moment-timezone';
import './Dispatcher.css';
import DispatcherQueue from './DispatcherQueue';
import { useError } from '../context/ErrorContext.jsx';
import { WebSocketContext } from '../context/WebSocketProvider.jsx';

const API_URL = import.meta.env.VITE_API_URL;
const LIMIT = 50;
const DISPATCHER_TOKEN_KEY = 'dispatcher_token';

const isManagerPosition = (value) => {
  const text = String(value || '').toLowerCase();
  return text.includes('менеджер') || text.includes('manager');
};

const hasWindowNumber = (value) => value !== null && value !== undefined && value !== '';

const LiveQueue = () => {
  const { showError } = useError();
  const socket = useContext(WebSocketContext);

  const [queue, setQueue] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const [questions, setQuestions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({
    manager_id: '',
    question_id: '',
    question_text: ''
  });

  const fetchQuestions = async () => {
    try {
      const res = await fetch(`${API_URL}/queue/questions`);
      const data = await res.json();
      setQuestions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Помилка завантаження питань:', err);
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await fetch(`${API_URL}/employees`);
      const data = await res.json();
      const rows = Array.isArray(data) ? data : [];
      const managers = rows.filter((emp) => isManagerPosition(emp.position));
      setEmployees(managers.length ? managers : rows);
    } catch (err) {
      console.error('Помилка завантаження працівників:', err);
    }
  };

  const fetchLiveQueue = async (pageNum = 1) => {
    setIsLoading(true);
    try {
      const offset = (pageNum - 1) * LIMIT;
      const params = new URLSearchParams({
        limit: LIMIT,
        offset,
        sort_field: 'appointment_time',
        sort_dir: 'desc',
        status: 'live_queue',
      });

      const res = await fetch(`${API_URL}/queue?${params.toString()}`);
      const data = await res.json();
      const rows = data.rows || [];
      const total = data.total || rows.length;
      setQueue(rows);
      setTotalPages(Math.max(1, Math.ceil(total / LIMIT)));
    } catch (err) {
      console.error('Помилка завантаження живої черги:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateLive = async () => {
    if (!form.manager_id || !form.question_id) {
      showError('Оберіть менеджера та питання.');
      return;
    }

    const manager = employees.find((m) => String(m.id) === String(form.manager_id));
    const windowId = manager?.window_number;

    if (!hasWindowNumber(windowId)) {
      showError('Для менеджера не задано номер вікна.');
      return;
    }

    const question = questions.find((q) => String(q.id) === String(form.question_id));
    const questionText = form.question_text.trim() || question?.text || null;
    const appointment_time = moment().tz('Europe/Kyiv').format('YYYY-MM-DD HH:mm:ss');

    setIsCreating(true);
    try {
      const res = await fetch(`${API_URL}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: form.question_id,
          question_text: questionText,
          appointment_time,
          window_id: windowId,
          status: 'live_queue'
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(data.error || 'Не вдалося створити запис.');
        return;
      }

      setForm((prev) => ({ ...prev, question_id: '', question_text: '' }));
      setPage(1);
      fetchLiveQueue(1);
    } catch (err) {
      console.error('Помилка створення живої черги:', err);
      showError('Не вдалося створити запис.');
    } finally {
      setIsCreating(false);
    }
  };

  useEffect(() => {
    fetchQuestions();
    fetchEmployees();
  }, []);

  useEffect(() => {
    fetchLiveQueue(page);
  }, [page]);

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'queue_updated') {
          setPage(1);
          fetchLiveQueue(1);
        }
      } catch (err) {
        console.error('WebSocket error in LiveQueue:', err);
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket]);

  const managerOptions = employees.filter((m) => hasWindowNumber(m.window_number));
  const managerByWindow = new Map(managerOptions.map((m) => [String(m.window_number), m]));
  return (
    <div className="queue-manager">
      <div className="queue-live">
        <h3>Жива черга</h3>
        <div className="queue-live-grid">
          <label>Менеджер
            <select
              value={form.manager_id}
              onChange={(e) => setForm((prev) => ({ ...prev, manager_id: e.target.value }))}
            >
              <option value="">Оберіть менеджера</option>
              {managerOptions.length === 0 ? (
                <option value="" disabled>Немає менеджерів із вікном</option>
              ) : managerOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — вікно {m.window_number}
                </option>
              ))}
            </select>
          </label>
          <label>Питання
            <select
              value={form.question_id}
              onChange={(e) => setForm((prev) => ({ ...prev, question_id: e.target.value }))}
            >
              <option value="">Оберіть питання</option>
              {questions.map((q) => (
                <option key={q.id} value={q.id}>{q.text}</option>
              ))}
            </select>
          </label>
          <label>Текст питання (опц.)
            <input
              type="text"
              value={form.question_text}
              onChange={(e) => setForm((prev) => ({ ...prev, question_text: e.target.value }))}
              placeholder="Додатковий опис"
            />
          </label>
          <button onClick={handleCreateLive} disabled={isCreating}>
            {isCreating ? 'Створення...' : 'Створити запис'}
          </button>
        </div>
        <div className="queue-live-hint">
          Запис створюється з поточним часом та статусом «Жива черга».
        </div>
      </div>

      <h2>Записи живої черги</h2>

      <div className="queue-pagination">
        {Array.from({ length: totalPages }, (_, i) => (
          <button key={i} className={i + 1 === page ? 'active' : ''} onClick={() => setPage(i + 1)}>
            {i + 1}
          </button>
        ))}
      </div>

      <table className="queue-table">
        <thead>
          <tr>
            <th>№ талону</th>
            <th>Дата та час</th>
            <th>Питання</th>
            <th>Менеджер</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          {queue.map((item) => {
            const formatted = new Date(item.appointment_time).toLocaleString('uk-UA', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
            });
            const manager = managerByWindow.get(String(item.window_id));
            const managerLabel = manager ? `${manager.name} — вікно ${manager.window_number}` : (item.window_id || '-');

            return (
              <tr key={item.id} className="status-livequeue">
                <td>{item.ticket_number || item.id}</td>
                <td>{formatted}</td>
                <td>{item.question_text}</td>
                <td>{managerLabel}</td>
                <td>Жива черга</td>
              </tr>
            );
          })}
          {!isLoading && queue.length === 0 && (
            <tr>
              <td colSpan={5} style={{ padding: '16px' }}>Немає записів</td>
            </tr>
          )}
        </tbody>
      </table>

      {isLoading && <p style={{ padding: '10px' }}>Завантаження...</p>}
    </div>
  );
};

const Dispatcher = () => {
  const [authorized, setAuthorized] = useState(false);
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [tab, setTab] = useState('queue');
  const { showError } = useError();

  useEffect(() => {
    const token = localStorage.getItem(DISPATCHER_TOKEN_KEY);
    if (token) setAuthorized(true);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem(DISPATCHER_TOKEN_KEY);
    setAuthorized(false);
    setName('');
    setPassword('');
    setTab('queue');
  };

  const handleLogin = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password, expectedPosition: 'Диспетчер' }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const token = data.token || 'dispatcher';
        localStorage.setItem(DISPATCHER_TOKEN_KEY, token);
        setAuthorized(true);
      } else {
        showError(data.error || 'Невірний логін або пароль.');
      }
    } catch (err) {
      showError('Помилка входу.');
      console.error('Login error:', err);
    }
  };

  if (!authorized) {
    return (
      <div className="dispatcher-login">
        <h2>Вхід для диспетчера</h2>
        <input
          type="text"
          placeholder="Ім'я"
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
    <div className="dispatcher-shell">
      <div className="dispatcher-top">
        <div className="dispatcher-tabs">
          <button
            className={tab === 'queue' ? 'active' : ''}
            onClick={() => setTab('queue')}
          >
            Черга
          </button>
          <button
            className={tab === 'live_queue' ? 'active' : ''}
            onClick={() => setTab('live_queue')}
          >
            Жива черга
          </button>
        </div>
        <button className="dispatcher-logout" onClick={handleLogout}>Вийти</button>
      </div>
      <div className="dispatcher-content">
        {tab === 'queue' ? <DispatcherQueue /> : <LiveQueue />}
      </div>
    </div>
  );
};

export default Dispatcher;