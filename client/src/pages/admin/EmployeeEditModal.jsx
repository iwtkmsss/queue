import React, { useState, useEffect } from 'react';
import './EmployeeEditModal.css';

const getMonday = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // понеділок
  return new Date(d.setDate(diff));
};

const getWeekDates = (startDate) => {
  const dates = [];
  for (let i = 0; i < 5; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    dates.push(date);
  }
  return dates;
};

const formatDate = (date) => date.toISOString().split('T')[0];
const formatUiDate = (date) => date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
const getDayName = (date) => date.toLocaleDateString('uk-UA', { weekday: 'short' });

const EmployeeEditModal = ({ employee, onClose, onSave }) => {
  const [tab, setTab] = useState('general');
  const [questions, setQuestions] = useState([]);
  const [form, setForm] = useState({
    ...employee,
    topics: Array.isArray(employee.topics) ? employee.topics : JSON.parse(employee.topics || '[]'),
    schedule: typeof employee.schedule === 'object' ? employee.schedule : JSON.parse(employee.schedule || '{}'),
    priority: employee.priority || 0,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [weekStart, setWeekStart] = useState(getMonday(new Date()));
  const [scheduleTemplate, setScheduleTemplate] = useState({});

  const dates = getWeekDates(weekStart);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/questions`)
      .then((res) => res.json())
      .then(setQuestions)
      .catch(() => alert('Не вдалося завантажити питання'));
  }, []);

  useEffect(() => {
    const savedTemplate = localStorage.getItem('scheduleTemplate');
    if (savedTemplate) {
      setScheduleTemplate(JSON.parse(savedTemplate));
    }
  }, []);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleScheduleChange = (date, time, value) => {
    setForm((prev) => ({
      ...prev,
      schedule: {
        ...prev.schedule,
        [date]: {
          ...(prev.schedule?.[date] || {}),
          [time]: value
        }
      }
    }));
  };

  const toggleTopic = (id) => {
    setForm((prev) => {
      const updated = prev.topics.includes(id)
        ? prev.topics.filter((t) => t !== id)
        : [...prev.topics, id];
      return { ...prev, topics: updated };
    });
  };

  const handleSave = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/employees/${form.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          window_number: form.window_number,
          topics: form.topics,
          schedule: form.schedule,
          priority: form.priority
        })
      });

      if (res.ok) {
        onSave();
        onClose();
      } else {
        alert('❌ Помилка при збереженні');
      }
    } catch (err) {
      alert('❌ Сервер недоступний');
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return setConfirmDelete(true);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/employees/${form.id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        onSave();
        onClose();
      } else {
        alert('❌ Не вдалося видалити працівника');
      }
    } catch {
      alert('❌ Серверна помилка');
    }
  };

  const shiftWeek = (offset) => {
    const newStart = new Date(weekStart);
    newStart.setDate(newStart.getDate() + offset * 7);
    setWeekStart(newStart);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-window">
        <div className="modal-header">
          <h3>Налаштування: {employee.name}</h3>
          <button onClick={onClose}>✖</button>
        </div>

        <div className="modal-tabs">
          <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>Вибір вікна</button>
          <button className={tab === 'schedule' ? 'active' : ''} onClick={() => setTab('schedule')}>Розклад</button>
          <button className={tab === 'topics' ? 'active' : ''} onClick={() => setTab('topics')}>Питання</button>
        </div>

        <div className="modal-body">
          {tab === 'general' && (
            <div className="modal-section">
              <label>Номер вікна:
                <input type="number" value={form.window_number || ''} onChange={(e) => handleChange('window_number', parseInt(e.target.value))} />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.priority === 1}
                  onChange={(e) => handleChange('priority', e.target.checked ? 1 : 0)}
                />
                Пріоритетний співробітник
              </label>
            </div>
          )}

          {tab === 'schedule' && (
            <>
              <div className="modal-week-nav">
                <button onClick={() => shiftWeek(-1)}>{'<'}</button>
                <span>{formatUiDate(dates[0])} – {formatUiDate(dates[dates.length - 1])}</span>
                <button onClick={() => shiftWeek(1)}>{'>'}</button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '10px' }}>
                <button
                  onClick={() => {
                    localStorage.setItem('scheduleTemplate', JSON.stringify(form.schedule));
                    setScheduleTemplate({ ...form.schedule });
                  }}
                >
                  📋 Зберегти шаблон
                </button>

                <button
                  onClick={() => {
                    const template = localStorage.getItem('scheduleTemplate');
                    if (!template) return;
                    const parsed = JSON.parse(template);
                    const newSchedule = { ...form.schedule };
                    dates.forEach((date) => {
                      const iso = formatDate(date);
                      if (parsed[iso]) {
                        newSchedule[iso] = parsed[iso];
                      }
                    });
                    setForm((prev) => ({ ...prev, schedule: newSchedule }));
                  }}
                  disabled={!localStorage.getItem('scheduleTemplate')}
                >
                  ✅ Застосувати шаблон
                </button>
              </div>
              <table className="schedule-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>День</th>
                    <th>Початок</th>
                    <th>Кінець</th>
                  </tr>
                </thead>
                <tbody>
                  {dates.map(date => {
                    const iso = formatDate(date);
                    return (
                      <tr key={iso}>
                        <td>{iso}</td>
                        <td>{getDayName(date)}</td>
                        <td><input type="time" value={form.schedule?.[iso]?.start || ''} onChange={(e) => handleScheduleChange(iso, 'start', e.target.value)} /></td>
                        <td><input type="time" value={form.schedule?.[iso]?.end || ''} onChange={(e) => handleScheduleChange(iso, 'end', e.target.value)} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}

          {tab === 'topics' && (
            <div className="modal-section checkbox-list">
              {questions.map((q) => (
                <label key={q.id}>
                  <span>{q.text}</span>
                  <input
                    type="checkbox"
                    checked={form.topics.includes(q.id)}
                    onChange={() => toggleTopic(q.id)}
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={handleSave}>💾 Зберегти</button>
          <button onClick={handleDelete} className="danger">
            {confirmDelete ? 'Підтвердити видалення' : '🗑️ Видалити'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmployeeEditModal;
