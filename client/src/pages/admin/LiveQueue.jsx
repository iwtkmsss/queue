import React, { useEffect, useState, useContext } from 'react';
import moment from 'moment-timezone';
import './QueueManager.css';
import './LiveQueue.css';
import { useError } from '../../context/ErrorContext';
import { WebSocketContext } from '../../context/WebSocketProvider';

const MultiSelectDropdown = ({
  label,
  options = [],
  value = [],
  onChange,
  placeholder = 'Обрати',
}) => {
  const ref = React.useRef(null);
  const [open, setOpen] = React.useState(false);
  const [dir, setDir] = React.useState('down');

  const selected = Array.isArray(value) ? value : [];
  const map = new Map(options.map(o => [o.id, o.label]));

  const toggle = () => setOpen(o => !o);
  const close = () => setOpen(false);

  React.useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  React.useEffect(() => {
    if (!open || !ref.current) return;
    const btn = ref.current.querySelector('.msd-btn');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const panelTarget = 320;
    setDir(spaceBelow < panelTarget + 24 ? 'up' : 'down');
  }, [open]);

  const handleToggleOption = (id) => {
    const set = new Set(selected);
    set.has(id) ? set.delete(id) : set.add(id);
    onChange(Array.from(set));
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange([]);
  };

  const chips = selected.slice(0, 2).map(id => map.get(id)).filter(Boolean);
  const more = Math.max(selected.length - chips.length, 0);

  return (
    <div className="msd" ref={ref}>
      {label && <div className="msd-label">{label}</div>}
      <button type="button" className="msd-btn" onClick={toggle} aria-expanded={open}>
        {selected.length === 0 ? (
          <span className="msd-ph">{placeholder}</span>
        ) : (
          <span className="msd-chips">
            {chips.map((t, i) => <span key={i} className="msd-chip">{t}</span>)}
            {more > 0 && <span className="msd-more">+{more}</span>}
          </span>
        )}
        <span className={`msd-caret ${open ? 'up' : ''}`}>▾</span>
      </button>

      {open && (
        <div className={`msd-panel ${dir}`} role="listbox" aria-multiselectable="true">
          <div className="msd-actions">
            <button type="button" className="msd-link" onClick={handleClear}>Очистити</button>
          </div>
          <div className="msd-list">
            {options.length === 0 ? (
              <div className="msd-empty">Немає опцій</div>
            ) : options.map(opt => (
              <label key={opt.id} className="msd-option">
                <input
                  type="checkbox"
                  checked={selected.includes(opt.id)}
                  onChange={() => handleToggleOption(opt.id)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const API_URL = import.meta.env.VITE_API_URL;
const LIMIT = 50;

const statusClassMap = {
  waiting: 'status-waiting',
  in_progress: 'status-inprogress',
  completed: 'status-completed',
  missed: 'status-missed',
  alarm_missed: 'status-alarm',
  did_not_appear: 'status-didnotappear',
  live_queue: 'status-livequeue'
};

const statusLabelMap = {
  waiting: 'Очікує',
  in_progress: 'В обслуговуванні',
  completed: 'Завершено',
  missed: 'Пропущено',
  alarm_missed: 'Пропущено (тривога)',
  did_not_appear: "Не з'явився",
  live_queue: 'Жива черга'
};

const statuses = Object.keys(statusLabelMap);

const tryParseArray = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const t = v.trim();
      if (!t) return [];
      if (t.startsWith('[')) return JSON.parse(t);
      return t.split(',').map((s) => s.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
};

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
  const [createForm, setCreateForm] = useState({
    manager_id: '',
    question_id: '',
    question_text: ''
  });

  const [options, setOptions] = useState({ extra_actions: [], application_types: [] });
  const [selected, setSelected] = useState(null);
  const [editForm, setEditForm] = useState({});

  const formatDateTimeLocal = (str) => {
    if (!str) return '';
    const d = new Date(str);
    if (isNaN(d.getTime())) return '';
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };

  const toSqlDateTime = (localStr) => {
    if (!localStr) return null;
    const d = new Date(localStr);
    if (isNaN(d.getTime())) return null;
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

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

  const fetchOptions = async () => {
    try {
      const res = await fetch(`${API_URL}/settings/options`);
      const data = await res.json();
      setOptions({
        extra_actions: Array.isArray(data.extra_actions) ? data.extra_actions : [],
        application_types: Array.isArray(data.application_types) ? data.application_types : [],
      });
    } catch (e) {
      console.error('Помилка завантаження опцій:', e);
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

  const fetchWindowWaiting = async (winId) => {
    if (!winId) return [];
    try {
      const params = new URLSearchParams({
        window_id: winId,
        status: 'waiting',
        limit: 500,
        offset: 0,
        sort_field: 'appointment_time',
        sort_dir: 'asc',
      });
      const res = await fetch(`${API_URL}/queue?${params.toString()}`);
      const data = await res.json();
      return Array.isArray(data.rows) ? data.rows : [];
    } catch {
      return [];
    }
  };

  const handleCreateLive = async () => {
    if (!createForm.manager_id || !createForm.question_id) {
      showError('Оберіть менеджера та питання.');
      return;
    }

    const manager = employees.find((m) => String(m.id) === String(createForm.manager_id));
    const windowId = manager?.window_number;

    if (!hasWindowNumber(windowId)) {
      showError('В обраного менеджера немає вікна.');
      return;
    }

    const question = questions.find((q) => String(q.id) === String(createForm.question_id));
    const questionText = createForm.question_text.trim() || question?.text || null;
    const appointment_time = moment().tz('Europe/Kyiv').format('YYYY-MM-DD HH:mm:ss');

    setIsCreating(true);
    try {
      const res = await fetch(`${API_URL}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: createForm.question_id,
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

      setCreateForm((prev) => ({ ...prev, question_id: '', question_text: '' }));
      setPage(1);
      fetchLiveQueue(1);
    } catch (err) {
      console.error('Помилка створення живої черги:', err);
      showError('Не вдалося створити запис.');
    } finally {
      setIsCreating(false);
    }
  };

  const openModal = (item) => {
    setSelected(item);
    setEditForm({
      ...item,
      appointment_time_local: formatDateTimeLocal(item.appointment_time),
      start_time_local: formatDateTimeLocal(item.start_time),
      end_time_local: formatDateTimeLocal(item.end_time),
      application_yesno: item.application_yesno === null || item.application_yesno === undefined ? '' : item.application_yesno ? '1' : '0',
      extra_actions: tryParseArray(item.extra_actions),
      application_types: tryParseArray(item.application_types),
      service_zone: item.service_zone === null || item.service_zone === undefined ? true : !!item.service_zone,
    });
  };

  const handleSave = async () => {
    if (!selected) return;

    const targetWindow = editForm.window_id ? parseInt(editForm.window_id, 10) : null;
    const targetDate = editForm.appointment_time_local || selected.appointment_time;
    if (targetWindow && targetDate) {
      try {
        const rows = await fetchWindowWaiting(targetWindow);
        const targetMs = new Date(targetDate).getTime();
        const hasSame = rows.some(
          (r) =>
            r.id !== selected.id &&
            !isNaN(new Date(r.appointment_time).getTime()) &&
            new Date(r.appointment_time).getTime() === targetMs
        );
        if (hasSame) {
          const timeText = new Date(targetDate).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
          const ok = window.confirm(`У вікна ${targetWindow} вже є запис на ${timeText}. Ви точно хочете продовжити?`);
          if (!ok) return;
        }
      } catch (err) {
        console.warn('Не вдалося перевірити конфлікт по часу:', err);
      }
    }

    const payload = {
      ticket_number: editForm.ticket_number || null,
      question_id: editForm.question_id || null,
      question_text: editForm.question_text || null,
      appointment_time: toSqlDateTime(editForm.appointment_time_local),
      start_time: toSqlDateTime(editForm.start_time_local),
      end_time: toSqlDateTime(editForm.end_time_local),
      window_id: editForm.window_id || null,
      status: editForm.status || null,
      personal_account: editForm.personal_account || null,
      extra_actions: Array.isArray(editForm.extra_actions) ? editForm.extra_actions : [],
      extra_other_text: editForm.extra_other_text || null,
      application_yesno: editForm.application_yesno === '' ? null : editForm.application_yesno === '1',
      application_types: Array.isArray(editForm.application_types) ? editForm.application_types : [],
      manager_comment: editForm.manager_comment || null,
      service_zone: editForm.service_zone === false || editForm.service_zone === 0 || editForm.service_zone === '0' ? 0 : 1,
    };

    try {
      const res = await fetch(`${API_URL}/queue/${selected.id}/full`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(data.error || 'Не вдалося зберегти зміни.');
        return;
      }
      setSelected(null);
      fetchLiveQueue(page);
    } catch (err) {
      console.error('Помилка оновлення талона:', err);
      showError('Не вдалося зберегти зміни.');
    }
  };

  useEffect(() => {
    fetchQuestions();
    fetchEmployees();
    fetchOptions();
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

  const questionOptions = questions.map((q) => ({ value: q.id, label: q.text }));
  const managerOptions = employees.filter((m) => hasWindowNumber(m.window_number));
  const managerByWindow = new Map(managerOptions.map((m) => [String(m.window_number), m]));

  return (
    <div className="queue-manager">
      <div className="queue-live">
        <h3>Жива черга</h3>
        <div className="queue-live-grid">
          <label>Менеджер
            <select
              value={createForm.manager_id}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, manager_id: e.target.value }))}
            >
              <option value="">Оберіть менеджера</option>
              {managerOptions.length === 0 ? (
                <option value="" disabled>Немає менеджерів з вікнами</option>
              ) : managerOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — вікно {m.window_number}
                </option>
              ))}
            </select>
          </label>
          <label>Питання
            <select
              value={createForm.question_id}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, question_id: e.target.value }))}
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
              value={createForm.question_text}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, question_text: e.target.value }))}
              placeholder="Вручну уточнити"
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
            <th>Час і дата</th>
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
            const statusClass = statusClassMap[item.status] || 'status-livequeue';

            return (
              <tr
                key={item.id}
                className={`${statusClass} queue-row`}
                onClick={() => openModal(item)}
              >
                <td>{item.ticket_number || item.id}</td>
                <td>{formatted}</td>
                <td>{item.question_text}</td>
                <td>{managerLabel}</td>
                <td>{statusLabelMap[item.status] || item.status}</td>
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

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <h3>Талон №{selected.ticket_number || selected.id}</h3>
            <div className="modal-grid">
              <label>Номер талону
                <input
                  type="number"
                  value={editForm.ticket_number || ''}
                  onChange={(e) => setEditForm({ ...editForm, ticket_number: e.target.value })}
                />
              </label>
              <label>Питання
                <select
                  value={editForm.question_id || ''}
                  onChange={(e) => setEditForm({ ...editForm, question_id: e.target.value })}
                >
                  <option value="">—</option>
                  {questionOptions.map((q) => (
                    <option key={q.value} value={q.value}>{q.label}</option>
                  ))}
                </select>
              </label>
              <label className="full-span">Текст питання
                <input
                  type="text"
                  value={editForm.question_text || ''}
                  onChange={(e) => setEditForm({ ...editForm, question_text: e.target.value })}
                  placeholder="Необов’язково, перекриє question_id"
                />
              </label>
              <label>Час запису
                <input
                  type="datetime-local"
                  value={editForm.appointment_time_local || ''}
                  onChange={(e) => setEditForm({ ...editForm, appointment_time_local: e.target.value })}
                />
              </label>
              <label>Старт обслуговування
                <input
                  type="datetime-local"
                  value={editForm.start_time_local || ''}
                  onChange={(e) => setEditForm({ ...editForm, start_time_local: e.target.value })}
                />
              </label>
              <label>Кінець обслуговування
                <input
                  type="datetime-local"
                  value={editForm.end_time_local || ''}
                  onChange={(e) => setEditForm({ ...editForm, end_time_local: e.target.value })}
                />
              </label>
              <label>Вікно
                <input
                  type="number"
                  value={editForm.window_id || ''}
                  onChange={(e) => setEditForm({ ...editForm, window_id: e.target.value })}
                />
              </label>
              <label>Статус
                <select
                  value={editForm.status || ''}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                >
                  <option value="">—</option>
                  {statuses.map((s) => <option key={s} value={s}>{statusLabelMap[s]}</option>)}
                </select>
              </label>
              <label>Особовий рахунок
                <input
                  type="text"
                  value={editForm.personal_account || ''}
                  onChange={(e) => setEditForm({ ...editForm, personal_account: e.target.value })}
                />
              </label>

              <label>Зона обслуговування
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="checkbox"
                    checked={editForm.service_zone === undefined || editForm.service_zone === null ? true : !!editForm.service_zone}
                    onChange={(e) => setEditForm({ ...editForm, service_zone: e.target.checked ? 1 : 0 })}
                  />
                  <span>{editForm.service_zone === 0 ? 'Не наша' : 'Наша'}</span>
                </label>
              </label>

              <div className="full-span">
                <MultiSelectDropdown
                  label="Додаткові дії"
                  options={options.extra_actions}
                  value={Array.isArray(editForm.extra_actions) ? editForm.extra_actions : []}
                  onChange={(arr) => setEditForm({ ...editForm, extra_actions: arr })}
                  placeholder="Обрати дію(ї)"
                />
              </div>
              <label>Інша дія (текст)
                <input
                  type="text"
                  value={editForm.extra_other_text || ''}
                  onChange={(e) => setEditForm({ ...editForm, extra_other_text: e.target.value })}
                />
              </label>
              <label>Заява (так/ні)
                <select
                  value={editForm.application_yesno}
                  onChange={(e) => setEditForm({ ...editForm, application_yesno: e.target.value })}
                >
                  <option value="">—</option>
                  <option value="1">Так</option>
                  <option value="0">Ні</option>
                </select>
              </label>
              <div className="full-span">
                <MultiSelectDropdown
                  label="Типи заяв"
                  options={options.application_types}
                  value={Array.isArray(editForm.application_types) ? editForm.application_types : []}
                  onChange={(arr) => setEditForm({ ...editForm, application_types: arr })}
                  placeholder="Обрати тип(и)"
                />
              </div>
              <label className="full-span">Коментар менеджера
                <textarea
                  rows={2}
                  value={editForm.manager_comment || ''}
                  onChange={(e) => setEditForm({ ...editForm, manager_comment: e.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button onClick={handleSave}>Зберегти</button>
              <button onClick={() => setSelected(null)}>Закрити</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveQueue;
