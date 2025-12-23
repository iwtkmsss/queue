import React, { useEffect, useMemo, useState } from 'react';
import './StaffTimeline.css';

const API_URL = import.meta.env.VITE_API_URL;

const pad = (n) => String(n).padStart(2, '0');
const minutesToTime = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const formatDateISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseLocalDate = (dateStr) => new Date(`${dateStr}T00:00:00`);

const dayLabel = (dateStr) => {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString('uk-UA', { weekday: 'short' }).toUpperCase();
};

const dateLabel = (dateStr) => {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const getWeekStart = (dateStr) => {
  const d = parseLocalDate(dateStr);
  if (isNaN(d.getTime())) return null;
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  return formatDateISO(monday);
};

const getIsoWeekday = (dateStr) => {
  const d = parseLocalDate(dateStr);
  if (isNaN(d.getTime())) return 1;
  const jsDay = d.getDay(); // 0..6
  return jsDay === 0 ? 7 : jsDay;
};

const getDateRange = (from, to) => {
  if (!from || !to) return [];
  const start = parseLocalDate(from);
  const end = parseLocalDate(to);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
  if (start > end) return [];
  const days = [];
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) {
      days.push(formatDateISO(cur));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return days;
};

const getTimeKey = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && value.length >= 16) return value.slice(11, 16);
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const StaffTimeline = ({ employees = [] }) => {
  const today = formatDateISO(new Date());
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [queue, setQueue] = useState([]);
  const [weekSchedules, setWeekSchedules] = useState([]);
  const [serviceMinutes, setServiceMinutes] = useState(20);
  const [loading, setLoading] = useState(false);
  const [collapsedDays, setCollapsedDays] = useState({});

  const days = useMemo(() => getDateRange(fromDate, toDate), [fromDate, toDate]);

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

  // schedules for weeks within selected range
  useEffect(() => {
    const fetchSchedules = async () => {
      try {
        if (days.length === 0) {
          setWeekSchedules([]);
          return;
        }
        const weekStarts = Array.from(new Set(days.map(getWeekStart).filter(Boolean))).sort();
        const params = new URLSearchParams({
          from: weekStarts[0],
          to: weekStarts[weekStarts.length - 1],
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
  }, [days]);

  // queue for the chosen range
  useEffect(() => {
    const fetchQueue = async () => {
      if (!fromDate || !toDate) return;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          from: fromDate,
          to: toDate,
          limit: 5000,
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
  }, [fromDate, toDate]);

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

  const scheduleByWeek = useMemo(() => {
    const map = new Map();
    weekSchedules.forEach((row) => {
      const weekStart = row.week_start || row.weekStart;
      if (!weekStart) return;
      try {
        const parsed = JSON.parse(row.data || '{}');
        let weekMap = map.get(weekStart);
        if (!weekMap) {
          weekMap = new Map();
          map.set(weekStart, weekMap);
        }
        weekMap.set(Number(row.employee_id), parsed);
      } catch {
        // ignore malformed
      }
    });
    return map;
  }, [weekSchedules]);

  const scheduleByDate = useMemo(() => {
    const map = new Map();
    days.forEach((day) => {
      const weekStart = getWeekStart(day);
      const weekMap = weekStart ? scheduleByWeek.get(weekStart) : null;
      const dayIndex = getIsoWeekday(day);
      const dayMap = new Map();
      if (weekMap) {
        weekMap.forEach((weekSched, empId) => {
          const daySched = weekSched[String(dayIndex)] || weekSched[dayIndex];
          if (daySched) dayMap.set(empId, daySched);
        });
      }
      map.set(day, dayMap);
    });
    return map;
  }, [days, scheduleByWeek]);

  const { queueByDate, queueMapByDate } = useMemo(() => {
    const byDate = new Map();
    const mapByDate = new Map();
    queue.forEach((q) => {
      const dateKey = typeof q.appointment_time === 'string' ? q.appointment_time.slice(0, 10) : '';
      if (!dateKey) return;

      const list = byDate.get(dateKey) || [];
      list.push(q);
      byDate.set(dateKey, list);

      const win = Number(q.window_id);
      const timeKey = getTimeKey(q.appointment_time);
      if (!win || !timeKey) return;
      let dayMap = mapByDate.get(dateKey);
      if (!dayMap) {
        dayMap = new Map();
        mapByDate.set(dateKey, dayMap);
      }
      dayMap.set(`${win}-${timeKey}`, q);
    });
    return { queueByDate: byDate, queueMapByDate: mapByDate };
  }, [queue]);

  const getSlotsForDay = (dayQueue, dayScheduleByEmployee) => {
    const step = serviceMinutes > 0 ? serviceMinutes : 20;
    let min = Infinity;
    let max = -Infinity;

    windows.forEach((w) => {
      const emp = employeesByWindow.get(w);
      const sched = emp ? dayScheduleByEmployee.get(emp.id) : null;
      if (sched?.start && sched?.end) {
        const [sh, sm] = sched.start.split(':').map(Number);
        const [eh, em] = sched.end.split(':').map(Number);
        const sMin = sh * 60 + sm;
        const eMin = eh * 60 + em;
        min = Math.min(min, sMin);
        max = Math.max(max, eMin);
      }
    });

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      dayQueue.forEach((q) => {
        const timeKey = getTimeKey(q.appointment_time);
        if (!timeKey) return;
        const [h, m] = timeKey.split(':').map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) return;
        const minutes = h * 60 + m;
        min = Math.min(min, minutes);
        max = Math.max(max, minutes + step);
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
  };

  const slotsByDate = useMemo(() => {
    const map = new Map();
    days.forEach((day) => {
      const dayQueue = queueByDate.get(day) || [];
      const daySchedule = scheduleByDate.get(day) || new Map();
      map.set(day, getSlotsForDay(dayQueue, daySchedule));
    });
    return map;
  }, [days, queueByDate, scheduleByDate, serviceMinutes, windows, employeesByWindow]);

  const renderCell = (win, timeStr, dayScheduleByEmployee, dayQueueMap) => {
    const emp = employeesByWindow.get(win);
    const sched = emp ? dayScheduleByEmployee.get(emp.id) : null;
    const withinSchedule = (() => {
      if (!sched?.start || !sched?.end) return false;
      const m = (h, mm) => h * 60 + mm;
      const [th, tm] = timeStr.split(':').map(Number);
      const cur = m(th, tm);
      const [sh, sm] = sched.start.split(':').map(Number);
      const [eh, em] = sched.end.split(':').map(Number);
      return cur >= m(sh, sm) && cur < m(eh, em);
    })();

    const booking = dayQueueMap.get(`${win}-${timeStr}`);

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

  useEffect(() => {
    setCollapsedDays((prev) => {
      const next = {};
      days.forEach((d) => {
        if (prev?.[d]) next[d] = true;
      });
      return next;
    });
  }, [days]);

  return (
    <div className="staff-timeline">
      <div className="st-top">
        <div>
          <h2>Рух співробітників</h2>
          <p className="st-sub">
            Швидкий огляд: хто на зміні, де є записи, а де можна направити клієнта.
          </p>
        </div>
        <div className="st-date-range">
          <label>
            З
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                const next = e.target.value || today;
                setFromDate(next);
                if (toDate && next > toDate) setToDate(next);
              }}
            />
          </label>
          <label>
            По
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                const next = e.target.value || today;
                setToDate(next);
                if (fromDate && next < fromDate) setFromDate(next);
              }}
            />
          </label>
          {loading && <div className="st-loading">Завантаження...</div>}
        </div>
      </div>

      {days.length === 0 ? (
        <div className="st-empty-range">Немає днів у діапазоні.</div>
      ) : (
        days.map((day) => {
          const isCollapsed = Boolean(collapsedDays[day]);
          const daySchedule = scheduleByDate.get(day) || new Map();
          const dayQueueMap = queueMapByDate.get(day) || new Map();
          const daySlots = slotsByDate.get(day) || [];
          const panelId = `st-day-${day}`;

          return (
            <div className="st-sheet" key={day}>
              <div className="st-sheet-head">
                <div className="st-day">{dayLabel(day)}</div>
                <div className="st-date-label">{dateLabel(day)}</div>
                <div className="st-head-actions">
                  <button
                    type="button"
                    className="st-toggle"
                    onClick={() => setCollapsedDays((prev) => ({ ...prev, [day]: !prev?.[day] }))}
                    aria-expanded={!isCollapsed}
                    aria-controls={panelId}
                  >
                    {isCollapsed ? 'Розгорнути' : 'Згорнути'}
                  </button>
                </div>
              </div>

              {!isCollapsed && (
                <div className="st-table-wrapper" id={panelId}>
                  <table className="st-table">
                    <thead>
                      <tr>
                        <th className="time-col">Час</th>
                        {windows.map((w) => {
                          const emp = employeesByWindow.get(w);
                          return (
                            <th key={w} className="window-col">
                              <div className="window-name">Вікно {w}</div>
                              <div className="employee-name">{emp?.name || '-'}</div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {daySlots.length === 0 ? (
                        <tr>
                          <td colSpan={1 + windows.length} className="empty-row">
                            Немає даних за цей день.
                          </td>
                        </tr>
                      ) : (
                        daySlots.map((time) => (
                          <tr key={time}>
                            <td className="time-col">{time}</td>
                            {windows.map((w) => (
                              <td key={`${w}-${time}`} className="window-cell">
                                {renderCell(w, time, daySchedule, dayQueueMap)}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};

export default StaffTimeline;
