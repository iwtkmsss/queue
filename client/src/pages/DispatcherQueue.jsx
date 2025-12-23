import React, { useEffect, useState, useContext } from 'react';
import './admin/QueueManager.css';
import { useError } from '../context/ErrorContext';
import { WebSocketContext } from '../context/WebSocketProvider';

// Спрощений багаторазовий селект (як у менеджері)
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
  did_not_appear: 'status-didnotappear'
};

const statusLabelMap = {
  waiting: 'Очікує',
  in_progress: 'В обслуговуванні',
  completed: 'Завершено',
  missed: 'Пропущено',
  alarm_missed: 'Пропущено (тривога)',
  did_not_appear: "Не з'явився"
};

const statuses = Object.keys(statusLabelMap);
const normalizeStatus = (status) => (status === 'live_queue' ? 'waiting' : status);
const isLiveQueueRecord = (item) => item?.queue_type === 'live' || item?.status === 'live_queue';
const formatStatusLabel = (status, isLive) => {
  const base = statusLabelMap[normalizeStatus(status)] || normalizeStatus(status) || status || '';
  return isLive ? `${base} (жива черга)` : base;
};

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

const DispatcherQueue = () => {
  const { showError } = useError();
  const socket = useContext(WebSocketContext);

  const [queue, setQueue] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filterWindow, setFilterWindow] = useState('');
  const [filterQuestion, setFilterQuestion] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sort, setSort] = useState({ field: 'appointment_time', dir: 'desc' });

  const [windowFrom, setWindowFrom] = useState('');
  const [windowTo, setWindowTo] = useState('');

  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({});

  const [questions, setQuestions] = useState([]);
  const [options, setOptions] = useState({ extra_actions: [], application_types: [] });

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

  const fetchQueue = async (pageNum = 1) => {
    setIsLoading(true);
    try {
      const offset = (pageNum - 1) * LIMIT;
      const params = new URLSearchParams({
        limit: LIMIT,
        offset,
        sort_field: sort.field,
        sort_dir: sort.dir,
      });
      if (fromDate) params.append('from', fromDate);
      if (toDate) params.append('to', toDate);
      if (filterWindow) params.append('window_id', filterWindow);
      if (filterQuestion) params.append('question_id', filterQuestion);
      if (filterStatus) params.append('status', filterStatus);

      const res = await fetch(`${API_URL}/queue?${params.toString()}`);
      const data = await res.json();
      const rows = data.rows || [];
      const total = data.total || rows.length;
      setQueue(rows);
      setTotalPages(Math.max(1, Math.ceil(total / LIMIT)));
    } catch (err) {
      console.error('Помилка завантаження черги:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTotalCount = async () => {
    try {
      const res = await fetch(`${API_URL}/queue/count`);
      const data = await res.json();
      setTotalPages(Math.max(1, Math.ceil((data.count || 0) / LIMIT)));
    } catch (err) {
      console.error('Помилка підрахунку черги:', err);
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

  const handleBulkRedirect = async () => {
    if (!windowFrom || !windowTo || isNaN(windowFrom) || isNaN(windowTo)) {
      showError('Вкажіть коректні номери вікон');
      return;
    }

    const fromWin = parseInt(windowFrom, 10);
    const toWin = parseInt(windowTo, 10);

    // Перевірка конфліктів часу у цільовому вікні
    try {
      const [fromRows, toRows] = await Promise.all([
        fetchWindowWaiting(fromWin),
        fetchWindowWaiting(toWin),
      ]);

      const toTimes = new Set(
        toRows
          .map((r) => new Date(r.appointment_time).getTime())
          .filter((t) => !isNaN(t))
      );
      const conflicts = fromRows
        .map((r) => new Date(r.appointment_time))
        .filter((d) => !isNaN(d.getTime()) && toTimes.has(d.getTime()))
        .map((d) => d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }));

      if (conflicts.length > 0) {
        const timesText = [...new Set(conflicts)].join(', ');
        const confirmed = window.confirm(`У вікна ${toWin} уже є запис на ${timesText}. Ви впевнені, що хочете перенести?`);
        if (!confirmed) return;
      }
    } catch (err) {
      console.warn('Не вдалося перевірити конфлікти під час перенесення:', err);
    }

    try {
      const res = await fetch(`${API_URL}/queue/move-window`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromWin,
          to: toWin
        })
      });

      const result = await res.json();

      if (res.ok) {
        showError(`Ок: клієнтів переміщено. Кількість: ${result.moved}`);
        fetchQueue(page);
      } else {
        showError(`Помилка: ${result.error || 'невідома'}`);
      }
    } catch (err) {
      console.error('Помилка PATCH:', err);
      showError('Помилка при перенесенні клієнтів');
    }
  };

  const openModal = (item) => {
    setSelected(item);
    setForm({
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

    // Перевірка конфлікту часу при ручній зміні вікна
    const targetWindow = form.window_id ? parseInt(form.window_id, 10) : null;
    const targetDate = form.appointment_time_local || selected.appointment_time;
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
          const ok = window.confirm(`У вікна ${targetWindow} уже є запис на ${timeText}. Ви впевнені, що хочете перенести?`);
          if (!ok) return;
        }
      } catch (err) {
        console.warn('Не вдалося перевірити конфлікт часу при збереженні:', err);
      }
    }
    const payload = {
      ticket_number: form.ticket_number || null,
      question_id: form.question_id || null,
      question_text: form.question_text || null,
      appointment_time: toSqlDateTime(form.appointment_time_local),
      start_time: toSqlDateTime(form.start_time_local),
      end_time: toSqlDateTime(form.end_time_local),
      window_id: form.window_id || null,
      status: form.status || null,
      personal_account: form.personal_account || null,
      extra_actions: Array.isArray(form.extra_actions) ? form.extra_actions : [],
      extra_other_text: form.extra_other_text || null,
      application_yesno: form.application_yesno === '' ? null : form.application_yesno === '1',
      application_types: Array.isArray(form.application_types) ? form.application_types : [],
      manager_comment: form.manager_comment || null,
      service_zone: form.service_zone === false || form.service_zone === 0 || form.service_zone === '0' ? 0 : 1,
    };

    try {
      const res = await fetch(`${API_URL}/queue/${selected.id}/full`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(data.error || 'Не вдалося зберегти');
        return;
      }
      setSelected(null);
      fetchQueue(page);
    } catch (err) {
      console.error('Помилка збереження:', err);
      showError('Помилка збереження');
    }
  };

  useEffect(() => {
    fetchTotalCount();
    fetchQuestions();
    fetchOptions();
  }, []);

  useEffect(() => {
    fetchQueue(page);
  }, [page, fromDate, toDate, filterWindow, filterQuestion, filterStatus, sort]);

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
        console.error('WebSocket error in QueueManager:', err);
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket]);

  const questionOptions = questions.map((q) => ({ value: q.id, label: q.text }));
  const isSelectedLive = selected ? isLiveQueueRecord(selected) : false;

  return (
    <div className="queue-manager">
      <div className="queue-filters">
        <h3>Фільтри</h3>
        <div className="filters-grid">
          <label>З дати
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>
          <label>По дату
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>
          <label>Вікно
            <input type="number" value={filterWindow} onChange={(e) => setFilterWindow(e.target.value)} placeholder="Будь-яке" />
          </label>
          <label>Питання
            <select value={filterQuestion} onChange={(e) => setFilterQuestion(e.target.value)}>
              <option value="">Всі</option>
              {questionOptions.map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
            </select>
          </label>
          <label>Статус
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">Всі</option>
              {statuses.map((s) => <option key={s} value={s}>{statusLabelMap[s]}</option>)}
            </select>
          </label>
          <button onClick={() => { setFromDate(''); setToDate(''); setFilterWindow(''); setFilterQuestion(''); setFilterStatus(''); }}>Скинути</button>
        </div>
      </div>

      <div className="queue-bulk-transfer">
        <h3>Масове перенесення вікон</h3>
        <input type="number" placeholder="З вікна..." value={windowFrom} onChange={(e) => setWindowFrom(e.target.value)} />
        <input type="number" placeholder="У вікно..." value={windowTo} onChange={(e) => setWindowTo(e.target.value)} />
        <button onClick={handleBulkRedirect}>Перенести</button>
      </div>

      <h2>Черга клієнтів</h2>

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
            <th>
              № талону
              <button className="sort-btn" onClick={() => setSort((s) => ({ field: 'ticket_number', dir: s.field === 'ticket_number' && s.dir === 'asc' ? 'desc' : 'asc' }))}>
                {sort.field === 'ticket_number' ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
              </button>
            </th>
            <th>
              Час і дата запису
              <button className="sort-btn" onClick={() => setSort((s) => ({ field: 'appointment_time', dir: s.field === 'appointment_time' && s.dir === 'asc' ? 'desc' : 'asc' }))}>
                {sort.field === 'appointment_time' ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
              </button>
            </th>
            <th>Питання</th>
            <th>Вікно</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          {queue.map((item) => {
            const formatted = new Date(item.appointment_time).toLocaleString('uk-UA', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
            });
            const isLive = isLiveQueueRecord(item);
            const statusKey = normalizeStatus(item.status);
            const statusClass = statusClassMap[statusKey] || '';

            return (
              <tr
                key={item.id}
                className={`${statusClass} ${isLive ? 'live-queue' : ''} queue-row`}
                onClick={() => openModal(item)}
              >
                <td>{item.ticket_number || item.id}</td>
                <td>{formatted}</td>
                <td>{item.question_text}</td>
                <td>{item.window_id || '-'}</td>
                <td>{formatStatusLabel(item.status, isLive)}</td>
              </tr>
            );
          })}
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
                  value={form.ticket_number || ''}
                  onChange={(e) => setForm({ ...form, ticket_number: e.target.value })}
                />
              </label>
              <label>Питання
                <select
                  value={form.question_id || ''}
                  onChange={(e) => setForm({ ...form, question_id: e.target.value })}
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
                  value={form.question_text || ''}
                  onChange={(e) => setForm({ ...form, question_text: e.target.value })}
                  placeholder="Необовʼязково, перекриє question_id"
                />
              </label>
              <label>Час запису
                <input
                  type="datetime-local"
                  value={form.appointment_time_local || ''}
                  onChange={(e) => setForm({ ...form, appointment_time_local: e.target.value })}
                />
              </label>
              <label>Старт обслуговування
                <input
                  type="datetime-local"
                  value={form.start_time_local || ''}
                  onChange={(e) => setForm({ ...form, start_time_local: e.target.value })}
                />
              </label>
              <label>Кінець обслуговування
                <input
                  type="datetime-local"
                  value={form.end_time_local || ''}
                  onChange={(e) => setForm({ ...form, end_time_local: e.target.value })}
                />
              </label>
              <label>Вікно
                <input
                  type="number"
                  value={form.window_id || ''}
                  onChange={(e) => setForm({ ...form, window_id: e.target.value })}
                />
              </label>
              <label>Статус
                <select
                  value={form.status || ''}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="">—</option>
                  {statuses.map((s) => (
                    <option key={s} value={s}>{formatStatusLabel(s, isSelectedLive)}</option>
                  ))}
                </select>
              </label>
              <label>Особовий рахунок
                <input
                  type="text"
                  value={form.personal_account || ''}
                  onChange={(e) => setForm({ ...form, personal_account: e.target.value })}
                />
              </label>

              <label>Зона обслуговування
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="checkbox"
                    checked={form.service_zone === undefined || form.service_zone === null ? true : !!form.service_zone}
                    onChange={(e) => setForm({ ...form, service_zone: e.target.checked ? 1 : 0 })}
                  />
                  <span>{form.service_zone === 0 ? 'Не наша' : 'Наша'}</span>
                </label>
              </label>

              <div className="full-span">
                <MultiSelectDropdown
                  label="Додаткові дії"
                  options={options.extra_actions}
                  value={Array.isArray(form.extra_actions) ? form.extra_actions : []}
                  onChange={(arr) => setForm({ ...form, extra_actions: arr })}
                  placeholder="Обрати дію(ї)"
                />
              </div>
              <label>Інша дія (текст)
                <input
                  type="text"
                  value={form.extra_other_text || ''}
                  onChange={(e) => setForm({ ...form, extra_other_text: e.target.value })}
                />
              </label>
              <label>Заява (так/ні)
                <select
                  value={form.application_yesno}
                  onChange={(e) => setForm({ ...form, application_yesno: e.target.value })}
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
                  value={Array.isArray(form.application_types) ? form.application_types : []}
                  onChange={(arr) => setForm({ ...form, application_types: arr })}
                  placeholder="Обрати тип(и)"
                />
              </div>
              <label className="full-span">Коментар менеджера
                <textarea
                  rows={2}
                  value={form.manager_comment || ''}
                  onChange={(e) => setForm({ ...form, manager_comment: e.target.value })}
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

export default DispatcherQueue;
