import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import './Statistics.css';

const API_URL = import.meta.env.VITE_API_URL;

const Statistics = () => {
  const [stats, setStats] = useState([]);
  const [byHour, setByHour] = useState([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [windowId, setWindowId] = useState('');
  const [questionId, setQuestionId] = useState('');

  const fetchStats = async () => {
    if (!fromDate || !toDate) return;
    const params = new URLSearchParams({ from: fromDate, to: toDate });
    if (windowId) params.append('window_id', windowId);
    if (questionId) params.append('question_id', questionId);

    try {
      const res = await fetch(`${API_URL}/queue/stats?${params.toString()}`);
      const data = await res.json();
      setStats(data.stats);
      setByHour(data.byHour);
    } catch (err) {
      console.error('Помилка при завантаженні статистики:', err);
    }
  };

  useEffect(() => {
        fetchStats();
    }, [fromDate, toDate, windowId, questionId]);
    useEffect(() => {
    const today = new Date();
    const day = today.getDay(); // неділя = 0, понеділок = 1, ..., субота = 6

    // Знайти понеділок (перший день тижня)
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((day + 6) % 7));

    // Знайти пʼятницю
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);

    const format = (date) => date.toISOString().split('T')[0];

    setFromDate(format(monday));
    setToDate(format(friday));
    }, []);

  return (
    <div className="statistics">
      <h2>📊 Статистика</h2>

      <div className="filters">
        <label>
          З дати:
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label>
          По дату:
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
        <label>
          Вікно:
          <input type="number" value={windowId} onChange={(e) => setWindowId(e.target.value)} placeholder="будь-яке" />
        </label>
        <label>
          Питання ID:
          <input type="number" value={questionId} onChange={(e) => setQuestionId(e.target.value)} placeholder="будь-яке" />
        </label>
      </div>

      <h3>📋 Статистика по вікнах</h3>
      <table>
        <thead>
          <tr>
            <th>Вікно</th>
            <th>Кількість клієнтів</th>
            <th>Середній час (хв)</th>
          </tr>
        </thead>
        <tbody>
          {stats.map(row => (
            <tr key={row.window_id}>
              <td>{row.window_id}</td>
              <td>{row.total_clients}</td>
              <td>{row.avg_service_minutes}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>📈 Графік завантаження по годинах</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={byHour} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="hour" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Line type="monotone" dataKey="count" stroke="#8884d8" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default Statistics;
