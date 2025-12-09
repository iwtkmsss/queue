import React, { useEffect, useMemo, useState } from 'react';
import './StaffTimeline.css';

const API_URL = import.meta.env.VITE_API_URL;

const pad = (n) => String(n).padStart(2, '0');
const minutesToTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

const dayLabel = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('uk-UA', { weekday: 'short' }).toUpperCase();
};

const dateLabel = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const StaffTimeline = ({ employees = [] }) => {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [queue, setQueue] = useState([]);
  const [weekSchedules, setWeekSchedules] = useState([]);
  const [serviceMinutes, setServiceMinutes] = useState(20);
  const [loading, setLoading] = useState(false);

  // settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch(`${API_URL}/settings/service_minutes`);
        const data = await res.json();
        if (data?.value) setServiceMinutes(Number(data.value));
      } catch {
        // ignore
      }
    };
    loadSettings();
  }, []);

  // schedules for week of selected date
  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        const d = new Date(date);
        const day = d.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        const monday = new Date(d);
        monday.setDate(d.getDate() + diffToMonday);
        const weekStart = monday.toISOString().split('T')[0];

        const params = new URLSearchParams({
          from: weekStart,
          to: weekStart,
          status: 'active',
        });
        const res = await fetch(`${API_URL}/schedules?${params.toString()}`);
        const data = await res.json();
        setWeekSchedules(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Schedules fetch error:', err);
        setWeekSchedules([]);
      }
    };
    fetchSchedules();
  }, [date]);

  // queue for the chosen date
  useEffect(() => {
    const fetchQueue = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          from: date,
          to: date,
          limit: 1000,
          offset: 0,
          sort_field: 'appointment_time',
          sort_dir: 'asc',
        });
        const res = await fetch(`${API_URL}/queue?${params.toString()}`);
        const data = await res.json();
        setQueue(Array.isArray(data.rows) ? data.rows : []);
      } catch (err) {
        console.error('Queue fetch error:', err);
        setQueue([]);
      } finally {
        setLoading(false);
      }
    };
    fetchQueue();
  }, [date]);

  const windows = useMemo(() => {
    const uniq = new Set();
    employees.forEach((e) => {
      if (e.window_number) uniq.add(Number(e.window_number));
    });
    return Array.from(uniq).sort((a, b) => a - b);
  }, [employees]);

  const employeesByWindow = useMemo(() => {
    const map = new Map();
    employees.forEach((e) => {
      const w = Number(e.window_number);
      if (!w) return;
      map.set(w, e);
    });
    return map;
  }, [employees]);

  const scheduleByEmployee = useMemo(() => {
    const map = new Map();
    const day = (() => {
      const d = new Date(date);
      const jsDay = d.getDay(); // 0..6
      return jsDay === 0 ? 7 : jsDay;
    })();
    weekSchedules.forEach((row) => {
      try {
        const parsed = JSON.parse(row.data || '{}');
        const daySched = parsed[String(day)] || parsed[day];
        if (daySched) {
          map.set(Number(row.employee_id), daySched);
        }
      } catch {
        // ignore malformed
      }
    });
    return map;
  }, [weekSchedules, date]);

  const queueMap = useMemo(() => {
    const map = new Map();
    queue.forEach((q) => {
      const win = Number(q.window_id);
      if (!win) return;
      const time = new Date(q.appointment_time);
      const timeKey = `${pad(time.getHours())}:${pad(time.getMinutes())}`;
      map.set(`${win}-${timeKey}`, q);
    });
    return map;
  }, [queue]);

  const slots = useMemo(() => {
    const step = serviceMinutes > 0 ? serviceMinutes : 20;
    let min = Infinity;
    let max = -Infinity;

    // derive bounds from schedules
    windows.forEach((w) => {
      const emp = employeesByWindow.get(w);
      const sched = emp ? scheduleByEmployee.get(emp.id) : null;
      if (sched?.start && sched?.end) {
        const [sh, sm] = sched.start.split(':').map(Number);
        const [eh, em] = sched.end.split(':').map(Number);
        const sMin = sh * 60 + sm;
        const eMin = eh * 60 + em;
        min = Math.min(min, sMin);
        max = Math.max(max, eMin);
      }
    });

    // fallback to queue times if no schedule
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      queue.forEach((q) => {
        const t = new Date(q.appointment_time);
        const m = t.getHours() * 60 + t.getMinutes();
        min = Math.min(min, m);
        max = Math.max(max, m + step);
      });
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return [];
    }

    const result = [];
    for (let m = min; m < max; m += step) {
      result.push(minutesToTime(m));
    }
    return result;
  }, [employeesByWindow, scheduleByEmployee, queue, serviceMinutes, windows]);

  const renderCell = (win, timeStr) => {
    const emp = employeesByWindow.get(win);
    const sched = emp ? scheduleByEmployee.get(emp.id) : null;
    const withinSchedule = (() => {
      if (!sched?.start || !sched?.end) return false;
      const m = (h, mm) => h * 60 + mm;
      const [th, tm] = timeStr.split(':').map(Number);
      const cur = m(th, tm);
      const [sh, sm] = sched.start.split(':').map(Number);
      const [eh, em] = sched.end.split(':').map(Number);
      return cur >= m(sh, sm) && cur < m(eh, em);
    })();

    const booking = queueMap.get(`${win}-${timeStr}`);

    if (booking) {
      return (
        <div className="slot booked">
          <div className="slot-title">Запис</div>
          <div className="slot-meta">
            {booking.ticket_number ? `Талон ${booking.ticket_number}` : 'Без талону'}
          </div>
          <div className="slot-text">
            {booking.question_text || booking.customer_name || '—'}
          </div>
        </div>
      );
    }

    if (withinSchedule) {
      return (
        <div className="slot free">
          <div className="slot-title">Вільна</div>
          <div className="slot-text">Можна направити клієнта</div>
        </div>
      );
    }

    return <div className="slot empty">—</div>;
  };

  return (
    <div className="staff-timeline">
      <div className="st-top">
        <div>
          <h2>Рух співробітників</h2>
          <p className="st-sub">
            Швидкий огляд: хто на зміні, де є записи, а де можна направити клієнта.
          </p>
        </div>
        <div className="st-date">
          <label>
            Дата
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || today)}
            />
          </label>
        </div>
      </div>

      <div className="st-sheet">
        <div className="st-sheet-head">
          <div className="st-day">{dayLabel(date)}</div>
          <div className="st-date-label">{dateLabel(date)}</div>
          {loading && <div className="st-loading">Оновлення...</div>}
        </div>

        <div className="st-table-wrapper">
          <table className="st-table">
            <thead>
              <tr>
                <th className="time-col">Час</th>
                {windows.map((w) => {
                  const emp = employeesByWindow.get(w);
                  return (
                    <th key={w} className="window-col">
                      <div className="window-name">Вікно {w}</div>
                      <div className="employee-name">{emp?.name || '—'}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {slots.length === 0 ? (
                <tr>
                  <td colSpan={1 + windows.length} className="empty-row">
                    Немає даних на цю дату
                  </td>
                </tr>
              ) : (
                slots.map((time) => (
                  <tr key={time}>
                    <td className="time-col">{time}</td>
                    {windows.map((w) => (
                      <td key={`${w}-${time}`} className="window-cell">
                        {renderCell(w, time)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default StaffTimeline;
