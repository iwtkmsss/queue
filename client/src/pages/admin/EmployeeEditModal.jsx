import React, { useEffect, useMemo, useState } from 'react';
import './EmployeeEditModal.css';

const API_URL = import.meta.env.VITE_API_URL;

const getMonday = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
};

const getWeekDates = (startDate) => {
  const dates = [];
  // Понеділок-п’ятниця
  for (let i = 0; i < 5; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    dates.push(date);
  }
  return dates;
};

const formatDate = (date) => date.toISOString().split('T')[0];
const formatUiDate = (date) =>
  date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
const getDayName = (date) =>
  date.toLocaleDateString('uk-UA', { weekday: 'short' });

const EmployeeEditModal = ({ employee, onClose, onSave }) => {
  const [tab, setTab] = useState('general');
  const [questions, setQuestions] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [weekStart, setWeekStart] = useState(getMonday(new Date()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const parsedTopics = (() => {
    if (Array.isArray(employee.topics)) return employee.topics;
    try {
      return JSON.parse(employee.topics || '[]');
    } catch {
      return [];
    }
  })();

  const [form, setForm] = useState({
    ...employee,
    window_number: employee.window_number ?? '',
    topics: parsedTopics,
    priority: employee.priority || 0,
    schedule: {},
  });

  const dates = useMemo(() => getWeekDates(weekStart), [weekStart]);

  useEffect(() => {
    fetch(`${API_URL}/questions`)
      .then((res) => res.json())
      .then(setQuestions)
      .catch(() => alert('Не вдалося завантажити теми'));
  }, []);

  useEffect(() => {
    const loadSchedule = async () => {
      setScheduleLoading(true);
      try {
        const weekIso = formatDate(weekStart);
        const params = new URLSearchParams({
          employee_id: employee.id,
          from: weekIso,
          to: weekIso,
          status: 'active',
        });
        const res = await fetch(`${API_URL}/schedules?${params.toString()}`);
        const data = await res.json();
        let schedule = {};
        if (Array.isArray(data) && data.length > 0) {
          const latest = data[0];
          try {
            const parsed = JSON.parse(latest.data || '{}');
            const nextSchedule = {};
            getWeekDates(weekStart).forEach((d) => {
              const iso = formatDate(d);
              const dayNum = d.getDay() === 0 ? 7 : d.getDay();
              const dayData = parsed[String(dayNum)] || parsed[dayNum];
              if (dayData) {
                nextSchedule[iso] = dayData;
              }
            });
            schedule = nextSchedule;
          } catch {
            schedule = {};
          }
        }
        setForm((prev) => ({ ...prev, schedule }));
      } catch (err) {
        console.error('Schedule load error', err);
      } finally {
        setScheduleLoading(false);
      }
    };

    loadSchedule();
  }, [weekStart, employee.id]);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleScheduleChange = (iso, timeKey, value) => {
    setForm((prev) => ({
      ...prev,
      schedule: {
        ...prev.schedule,
        [iso]: {
          ...(prev.schedule?.[iso] || {}),
          [timeKey]: value,
        },
      },
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

  const shiftWeek = (offset) => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + offset * 7);
    setWeekStart(next);
  };

  const buildSchedulePayload = () => {
    const data = {};
    dates.forEach((d) => {
      const iso = formatDate(d);
      const dayNum = d.getDay() === 0 ? 7 : d.getDay();
      const dayData = form.schedule?.[iso];
      if (dayData?.start && dayData?.end) {
        data[dayNum] = {
          start: dayData.start,
          end: dayData.end,
        };
      }
    });
    return data;
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const employeeRes = await fetch(`${API_URL}/employees/${form.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          window_number: form.window_number ? Number(form.window_number) : null,
          topics: form.topics,
          priority: form.priority || 0,
        }),
      });

      if (!employeeRes.ok) {
        const errBody = await employeeRes.json().catch(() => ({}));
        throw new Error(errBody.error || 'Не вдалося зберегти співробітника');
      }

      const scheduleData = buildSchedulePayload();
      if (Object.keys(scheduleData).length > 0) {
        const schedRes = await fetch(`${API_URL}/schedules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_id: form.id,
            week_start: formatDate(weekStart),
            data: scheduleData,
          }),
        });
        if (!schedRes.ok) {
          const errBody = await schedRes.json().catch(() => ({}));
          throw new Error(errBody.error || 'Не вдалося зберегти графік');
        }
      }

      onSave();
      onClose();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Сталася помилка під час збереження');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/employees/${form.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onSave();
        onClose();
      } else {
        alert('Не вдалося видалити співробітника');
      }
    } catch {
      alert('Не вдалося видалити співробітника');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-window">
        <div className="modal-header">
          <h3>Редагування: {employee.name}</h3>
          <button onClick={onClose}>X</button>
        </div>

        <div className="modal-tabs">
          <button
            className={tab === 'general' ? 'active' : ''}
            onClick={() => setTab('general')}
          >
            Загальне
          </button>
          <button
            className={tab === 'schedule' ? 'active' : ''}
            onClick={() => setTab('schedule')}
          >
            Розклад
          </button>
          <button
            className={tab === 'topics' ? 'active' : ''}
            onClick={() => setTab('topics')}
          >
            Теми
          </button>
        </div>

        <div className="modal-body">
          {tab === 'general' && (
            <div className="modal-section">
              <label>
                Номер вікна:
                <input
                  type="number"
                  value={form.window_number ?? ''}
                  onChange={(e) => handleChange('window_number', e.target.value)}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={form.priority === 1}
                  onChange={(e) => handleChange('priority', e.target.checked ? 1 : 0)}
                />
                Високий пріоритет
              </label>
            </div>
          )}

          {tab === 'schedule' && (
            <>
              <div className="modal-week-nav">
                <button onClick={() => shiftWeek(-1)} disabled={scheduleLoading || saving}>
                  {'<'}
                </button>
                <span>
                  {formatUiDate(dates[0])} — {formatUiDate(dates[dates.length - 1])}
                </span>
                <button onClick={() => shiftWeek(1)} disabled={scheduleLoading || saving}>
                  {'>'}
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
                  {dates.map((date) => {
                    const iso = formatDate(date);
                    return (
                      <tr key={iso}>
                        <td>{formatUiDate(date)}</td>
                        <td>{getDayName(date)}</td>
                        <td>
                          <input
                            type="time"
                            value={form.schedule?.[iso]?.start || ''}
                            onChange={(e) => handleScheduleChange(iso, 'start', e.target.value)}
                            disabled={saving}
                          />
                        </td>
                        <td>
                          <input
                            type="time"
                            value={form.schedule?.[iso]?.end || ''}
                            onChange={(e) => handleScheduleChange(iso, 'end', e.target.value)}
                            disabled={saving}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {scheduleLoading && <p style={{ marginTop: '8px' }}>Завантаження розкладу...</p>}
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

        {error && <div className="error-text">{error}</div>}

        <div className="modal-footer">
          <button onClick={handleSave} disabled={saving}>
            {saving ? 'Збереження...' : 'Зберегти'}
          </button>
          <button onClick={handleDelete} className="danger">
            {confirmDelete ? 'Підтвердити видалення' : 'Видалити'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmployeeEditModal;
