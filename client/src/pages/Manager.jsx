import React, { useState, useEffect, useRef, useContext } from 'react';
import './Manager.css';
import { useError } from '../context/ErrorContext';
import moment from 'moment-timezone';
import { WebSocketContext } from '../context/WebSocketProvider';

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
        console.log('📊 Статистика оновлена');
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
            return { ...app, status: 'missed' }; // або 'skipped' — в залежності від термінології
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
    showError('Не вдалося позначити клієнта як \"Не зʼявився\"');
  }
};

  const handleFinish = async (id) => {
    try {
      const res = await fetch(`${API_URL}/appointments/${id}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employee.id }),
      });
      if (!res.ok) throw new Error();

      setAppointments(prev =>
        prev.map(item =>
          item.id === id ? { ...item, status: 'completed' } : item
        )
      );

      setSelectedTicket(null);
    } catch {
      showError('Не вдалося завершити обслуговування');
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
        ⚠️ УВАГА!!! Наступний споживач чекає!
      </div>
    )}
      <div className="manager-header">
        <h2>Вікно №{employee.window_number}, {employee.name}</h2>
        <button className="logout-btn" onClick={() => {
          localStorage.removeItem('employee');
          window.location.reload();
        }}>
          Вийти
        </button>
      </div>
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
                const status = app.status?.toLowerCase();
                if (status !== 'waiting' && status !== 'in_progress') return;
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
            <div className="modal-actions">
              {selectedTicket.status?.toLowerCase() === 'waiting' && (
                <button className="start" onClick={() => handleStart(selectedTicket.id)}>Старт</button>
              )}
              {selectedTicket.status?.toLowerCase() === 'in_progress' && (
                <button className="finish" onClick={() => handleFinish(selectedTicket.id)}>Фініш</button>
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
