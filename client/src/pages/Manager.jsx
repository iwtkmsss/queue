import React, { useState, useEffect, useRef, useContext } from 'react';
import './Manager.css';
import { useError } from '../context/ErrorContext';
import moment from 'moment-timezone';
import { WebSocketContext } from '../context/WebSocketProvider';

// ——— Compact multi-select dropdown (no libs)
const MultiSelectDropdown = ({
  label,
  options = [],
  value = [],
  onChange,
  placeholder = 'Оберіть',
  required = false,
}) => {
  const ref = React.useRef(null);
  const [open, setOpen] = React.useState(false);
  const [dir, setDir] = React.useState('down'); // 'down' | 'up'

  const isArray = Array.isArray;
  const selected = isArray(value) ? value : [];
  const map = new Map(options.map(o => [o.id, o.label]));

  const toggle = () => setOpen(o => !o);
  const close = () => setOpen(false);

  React.useEffect(() => {
    const onDoc = (e) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Коли відкриваємо — визначаємо, є місце вниз чи краще вгору
  React.useEffect(() => {
    if (!open || !ref.current) return;
    const btn = ref.current.querySelector('.msd-btn');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const panelTarget = 360; // бажана висота (максимум) у px
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
      {label && (
        <div className="msd-label">
          {label}{required && <span className="req">*</span>}
        </div>
      )}
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
              <div className="msd-empty">Список порожній</div>
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

const Manager = () => {
  const { showError } = useError();
  const [employee, setEmployee] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('employee'));
    } catch {
      return null;
    }
  });   
  const [showWarning, setShowWarning] = useState(false);
  const appointmentsRef = useRef([]);

  const [appointments, setAppointments] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const currentClient = appointments.find(app => app.status === 'in_progress');
  const [now, setNow] = useState(moment.tz('Europe/Kyiv'));
  const [serviceDuration, setServiceDuration] = useState(20);

  // === META STATE (multi-selects + boolean) ===
  const [meta, setMeta] = useState({
    personal_account: '',
    extra_actions: [],        // масив id
    extra_other_text: '',     // обов'язково якщо обране "Інше"
    application_yesno: null,  // true/false
    application_types: [],    // масив id
    manager_comment: '',
  });

  const [options, setOptions] = useState({
    extra_actions: [],        // {id,label}
    application_types: [],    // {id,label}
  });

  const [metaSaving, setMetaSaving] = useState(false);
  const saveTimer = useRef(null);

  const socket = useContext(WebSocketContext);

  const fetchAppointments = async () => {
    try {
      const res = await fetch(`${API_URL}/appointments/today?window=${employee.window_number}`);
      const data = await res.json();
      if (!Array.isArray(data)) {
        showError('Помилка отримання черги');
        return;
      }
      setAppointments(data);
    } catch (err) {
      console.error(err);
      showError('Помилка сервера');
    }
  };

  // --- helpers ---
  const parseArray = (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') {
      try {
        const t = v.trim();
        return t.startsWith('[') ? JSON.parse(t) : (t ? [t] : []);
      } catch {
        return [];
      }
    }
    return [];
  };
  
  const validateMetaLocal = (m) => {
    const errs = [];
    const isArray = Array.isArray;

    if (!m.personal_account?.trim()) errs.push('Вкажіть особовий рахунок.');
    if (isArray(m.extra_actions) &&
        m.extra_actions.includes('EX_OTHER_FREE_TEXT') &&
        !m.extra_other_text?.trim()) {
      errs.push('Опишіть "Інше" у текстовому полі.');
    }
    if (m.application_yesno === null) errs.push('Вкажіть, чи є заява (так/ні).');
    if (m.application_yesno === true && (!isArray(m.application_types) || m.application_types.length === 0)) {
      errs.push('Оберіть тип(и) заяви.');
    }
    return errs;
  };

  const saveMeta = async (id, nextMeta) => {
    if (!id) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(async () => {
      try {
        setMetaSaving(true);
        const res = await fetch(`${API_URL}/appointments/${id}/meta`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nextMeta),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || (err.errors ? err.errors.join(', ') : 'Помилка збереження'));
        }
      } catch (e) {
        showError(String(e.message || e));
      } finally {
        setMetaSaving(false);
      }
    }, 400);
  };

  const isExtraOtherSelected = Array.isArray(meta.extra_actions) && meta.extra_actions.includes('EX_OTHER_FREE_TEXT');
  const isFinishDisabled =
    !meta.personal_account.trim() ||
    (isExtraOtherSelected && !meta.extra_other_text.trim()) ||
    (meta.application_yesno === null) ||
    (meta.application_yesno === true && 
      (!Array.isArray(meta.application_types) || meta.application_types.length === 0));

  const onMetaChange = (patch) => {
    const next = { ...meta, ...patch };
    setMeta(next);

    if (selectedTicket?.id) {
      // 1) Оновлюємо вибраний талон (те, що показано в модалці)
      setSelectedTicket(prev =>
        prev && prev.id === selectedTicket.id
          ? { ...prev, ...patch }
          : prev
      );

      // 2) Оновлюємо цей же талон у загальному списку appointments
      setAppointments(prev =>
        prev.map(app =>
          app.id === selectedTicket.id
            ? { ...app, ...patch }
            : app
        )
      );

      // 3) Відправляємо оновлену мету на сервер (як і було)
      saveMeta(selectedTicket.id, next);
    }
  };

  useEffect(() => {
    appointmentsRef.current = appointments;
  }, [appointments]);

  useEffect(() => {
    const fetchServiceDuration = async () => {
      try {
        const res = await fetch(`${API_URL}/settings/service_duration`);
        const data = await res.json();
        if (data?.value) {
          setServiceDuration(Number(data.value));
        }
      } catch {
        console.warn('⚠ Не вдалося отримати service_duration');
      }
    };
  
    fetchServiceDuration();
  }, []);

  // завантаження довідників
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const res = await fetch(`${API_URL}/settings/options`);
        const data = await res.json();
        setOptions({
          extra_actions: Array.isArray(data.extra_actions) ? data.extra_actions : [],
          application_types: Array.isArray(data.application_types) ? data.application_types : [],
        });
      } catch (e) {
        showError('Не вдалося отримати довідники опцій');
      }
    };
    loadOptions();
  }, []);

  // ІНІЦІАЛІЗАЦІЯ META за вибраним талоном
  useEffect(() => {
    if (!selectedTicket) {
      setMeta({
        personal_account: '',
        extra_actions: [],
        extra_other_text: '',
        application_yesno: null,
        application_types: [],
        manager_comment: '',
      });
      return;
    }
    setMeta({
      personal_account: selectedTicket.personal_account || '',
      extra_actions: parseArray(selectedTicket.extra_actions),
      extra_other_text: selectedTicket.extra_other_text || '',
      application_yesno:
        selectedTicket.application_yesno === null || selectedTicket.application_yesno === undefined
          ? null
          : !!selectedTicket.application_yesno,
      application_types: parseArray(selectedTicket.application_types),
      manager_comment: selectedTicket.manager_comment || '',
    });
  }, [selectedTicket]);

  useEffect(() => {
    if (!employee) return;
    fetchAppointments();
    const interval = setInterval(fetchAppointments, 30000);
    return () => clearInterval(interval);
  }, [employee]);

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'queue_updated') {
        fetchAppointments();
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();

      const overdue = appointmentsRef.current.filter(entry => {
        const isWaiting = entry.status === 'waiting';
        const noStart = !entry.start_time || entry.start_time === 'null' || entry.start_time === '';
        const timePassed = new Date(entry.appointment_time).getTime() + 60000 < now.getTime();

        return isWaiting && noStart && timePassed;
      });

      if (overdue.length > 0) {
        setShowWarning(true);
      } else {
        setShowWarning(false);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const checkAndSkip = () => {
      const now = moment.tz('Europe/Kyiv');

      setAppointments(prev => {
        return prev.map(app => {
          const isExpired =
            app.status?.toLowerCase() === 'waiting' &&
            moment(app.appointment_time).isBefore(now.clone().subtract(serviceDuration + 5, 'minutes'));

          if (isExpired) {
            handleSkip(app.id);
            return { ...app, status: 'missed' };
          }

          return app;
        });
      });
    };

    const interval = setInterval(checkAndSkip, 10000);
    checkAndSkip();

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  
  
  const handleStart = async (id) => {
    try {
      const res = await fetch(`${API_URL}/appointments/${id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employee.id }),
      });
      if (!res.ok) throw new Error();

      setAppointments(prev =>
        prev.map(item =>
          item.id === id ? { ...item, status: 'in_progress' } : item
        )
      );

      setSelectedTicket(prev =>
        prev && prev.id === id ? { ...prev, status: 'in_progress' } : prev
      );
      setShowWarning(false);
    } catch {
      showError('Не вдалося почати обслуговування');
    }
  };


  const handleSkip = async (id) => {
    try {
      const res = await fetch(`${API_URL}/appointments/${id}/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employee.id }),
      });
      if (!res.ok) throw new Error();

      setAppointments(prev =>
        prev.map(item =>
          item.id === id ? { ...item, status: 'missed' } : item
        )
      );

      setSelectedTicket(null);
    } catch {
      showError('Не вдалося пропустити клієнта');
    }
  };

  
  const handleDidNotAppear = async (id) => {
    try {
      const res = await fetch(`${API_URL}/appointments/${id}/did-not-appear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employee.id }),
      });
      if (!res.ok) throw new Error();

      setAppointments(prev =>
        prev.map(item =>
          item.id === id ? { ...item, status: 'did_not_appear' } : item
        )
      );

      setSelectedTicket(null);
    } catch {
      showError('Не вдалося позначити клієнта як "Не зʼявився"');
    }
  };

  const handleFinish = async (id) => {
    // локальна перевірка лише при натисканні
    const errs = validateMetaLocal(meta);
    if (errs.length) {
      showError(errs.join('\n'));
      return;
    }

    try {
      const res = await fetch(`${API_URL}/appointments/${id}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(meta),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || (err.errors ? err.errors.join(', ') : 'Не вдалося завершити обслуговування'));
      }

      setAppointments(prev => prev.map(item =>
        item.id === id ? { ...item, status: 'completed' } : item
      ));
      setSelectedTicket(null);
    } catch (e) {
      showError(String(e.message || e));
    }
  };


  if (!employee) {
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const { showError } = useError();

    const handleLogin = async () => {
      try {
        const res = await fetch(`${API_URL}/auth/login/employee`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, password })
        });

        const data = await res.json();

        if (!res.ok) {
          showError(data.error || 'Помилка входу');
          return;
        }

        localStorage.setItem('employee', JSON.stringify(data));
        window.location.reload();
      } catch (err) {
        console.error(err);
        showError('Помилка сервера');
      }
    };

    return (
      <div className="login-container">
        <h2>Вхід для працівника</h2>
        <input
          type="text"
          placeholder="Ім’я"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        <button onClick={handleLogin}>Увійти</button>
      </div>
    );
  }

  const sortedAppointments = [
    // Спочатку: waiting і in_progress — по часу (найраніші зверху)
    ...appointments
      .filter(a => {
        const status = a.status?.toLowerCase();
        return status === 'waiting' || status === 'in_progress';
      })
      .sort((a, b) => new Date(a.appointment_time) - new Date(b.appointment_time)),

    // Далі: всі інші статуси — знизу, у зворотному порядку
    ...appointments
      .filter(a => {
        const status = a.status?.toLowerCase();
        return status !== 'waiting' && status !== 'in_progress';
      })
      .sort((a, b) => new Date(b.appointment_time) - new Date(a.appointment_time))
  ];


  return (
    <div className="manager-container">
      {showWarning && (
        <div className="warning-banner">
          ⚠️ УВАГА! Наступний споживач очікує на обслуговування.
        </div>
      )}

      <div className="manager-header">
        <div className="manager-title-block">
          <h2>Вікно №{employee.window_number}</h2>
          <p className="manager-subtitle">
            Оператор: <span>{employee.name}</span>
          </p>
        </div>

        <button
          className="logout-btn"
          onClick={() => {
            localStorage.removeItem('employee');
            window.location.reload();
          }}
        >
          Вийти
        </button>
      </div>

      {currentClient && (
        <div className="current-client-card">
          <div className="cc-label">Зараз обслуговується</div>
          <div className="cc-main">
            <div className="cc-time">
              {new Date(currentClient.appointment_time).toLocaleTimeString('uk-UA', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
            <div className="cc-info">
              <div className="cc-question">{currentClient.question_text}</div>
              <div className="cc-meta">
                Талон №{currentClient.id}
              </div>
            </div>
          </div>
        </div>
      )}

      <ul className="ticket-list">
        {sortedAppointments.length === 0 ? (
          <li className="ticket empty">
            Наразі нові записи відсутні
          </li>
        ) : (
          sortedAppointments.map(app => (
            <li
              key={app.id}
              className={`ticket ${app.status?.toLowerCase()}`}
              onClick={() => {
                if (
                app.status?.toLowerCase() === 'completed' || 
                app.status?.toLowerCase() === 'missed' || 
                app.status?.toLowerCase() === 'did_not_appear') {
                  return; 
              }
              setSelectedTicket(app);
            }}
            >
              <strong>
                {new Date(app.appointment_time).toLocaleTimeString('uk-UA', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </strong>
              <span>{app.question_text}</span>
              <span className="status">{app.status}</span>
            </li>
          ))
        )}
      </ul>
      {selectedTicket && (
      <div className="modal-overlay" onClick={() => setSelectedTicket(null)}>
        <div className="modal-window" onClick={e => e.stopPropagation()}>
          <h3>Талон №{selectedTicket.id}</h3>
          <p>Час: {new Date(selectedTicket.appointment_time).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}</p>
          <p>Питання: {selectedTicket.question_text}</p>
          <p>Статус: {selectedTicket.status}</p>

          {/* ФОРМА (окрема від кнопок) */}
          <div className="modal-body">
            <div className="meta-form">
              <div className="field field-account">
                <label>Особовий рахунок<span className="req">*</span></label>
                <input
                  type="text"
                  value={meta.personal_account}
                  onChange={e => onMetaChange({ personal_account: e.target.value })}
                  placeholder="Введіть особовий рахунок"
                />
              </div>

              <div className="field field-extra">
                <MultiSelectDropdown
                  label="Додаткові дії"
                  options={options.extra_actions}
                  value={Array.isArray(meta.extra_actions) ? meta.extra_actions : []}
                  onChange={(arr) => onMetaChange({ extra_actions: arr })}
                  placeholder="Обрати дію(ї)"
                  zIndex={200000}
                />

                {Array.isArray(meta.extra_actions) && meta.extra_actions.includes('EX_OTHER_FREE_TEXT') && (
                  <div className="field nested field-extra-other">
                    <label>Інше — опишіть<span className="req">*</span></label>
                    <input
                      type="text"
                      value={meta.extra_other_text}
                      onChange={e => onMetaChange({ extra_other_text: e.target.value })}
                      placeholder="Коротко опишіть іншу дію"
                    />
                  </div>
                )}
              </div>

              <div className="field field-yesno">
                <label>Заява<span className="req">*</span></label>
                <div className="radio-group">
                  <label><input
                    type="radio"
                    name="application_yesno"
                    checked={meta.application_yesno === true}
                    onChange={() => onMetaChange({ application_yesno: true })}
                  /> Так</label>
                  <label><input
                    type="radio"
                    name="application_yesno"
                    checked={meta.application_yesno === false}
                    onChange={() => onMetaChange({ application_yesno: false, application_types: [] })}
                  /> Ні</label>
                </div>
              </div>

              {meta.application_yesno === true && (
                <div className="field field-app-types">
                  <MultiSelectDropdown
                    label="Тип(и) заяви"
                    required
                    options={options.application_types}
                    value={Array.isArray(meta.application_types) ? meta.application_types : []}
                    onChange={(arr) => onMetaChange({ application_types: arr })}
                    placeholder="Обрати тип(и)"
                    zIndex={190000}
                  />
                </div>
              )}

              <div className="field field-comment">
                <label>Коментар</label>
                <textarea
                  rows={3}
                  value={meta.manager_comment}
                  onChange={e => onMetaChange({ manager_comment: e.target.value })}
                  placeholder="За бажанням додайте примітку"
                />
              </div>

              {metaSaving && <div className="saving-hint">Збереження…</div>}
            </div>
          </div>
          {/* НИЖНЯ ПАНЕЛЬ КНОПОК */}
          <div className="modal-footer">
            {selectedTicket.status?.toLowerCase() === 'waiting' && (
              <button className="start" onClick={() => handleStart(selectedTicket.id)}>Старт</button>
            )}
            {selectedTicket.status?.toLowerCase() === 'in_progress' && (
              <button className="finish" onClick={() => handleFinish(selectedTicket.id)}>
                Фініш
              </button>
            )}
            <button className="skip" onClick={() => handleDidNotAppear(selectedTicket.id)}>Не зʼявився</button>
            {selectedTicket.status?.toLowerCase() !== 'in_progress' && (
              <button className="close" onClick={() => setSelectedTicket(null)}>Закрити</button>
            )}
          </div>
        </div>
      </div>
    )}
    </div>
  );
};

export default Manager;
