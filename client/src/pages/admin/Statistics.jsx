import React, { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';
import './Statistics.css';

const API_URL = import.meta.env.VITE_API_URL;

const GROUP_OPTIONS = [
  { value: 'hour', label: 'По годинах' },
  { value: 'window', label: 'По вікнах' },
  { value: 'question', label: 'По питаннях' },
];

const STATUS_LABEL = {
  '': 'Всі',
  waiting: 'Очікує',
  in_progress: 'В обслуговуванні',
  completed: 'Завершено',
  missed: 'Пропущено',
  did_not_appear: "Не з'явився",
};

const EXPORT_FIELDS = [
  { key: 'id', label: 'ID' },
  { key: 'ticket_number', label: 'Номер талону' },
  { key: 'window_id', label: 'Вікно' },
  { key: 'question_id', label: 'ID питання' },
  { key: 'question_text', label: 'Текст питання' },
  { key: 'appointment_time', label: 'Час запису' },
  { key: 'start_time', label: 'Початок обслуговування' },
  { key: 'end_time', label: 'Завершення обслуговування' },
  { key: 'status', label: 'Статус' },
  { key: 'created_at', label: 'Створено' },
  { key: 'personal_account', label: 'Особовий рахунок' },
  { key: 'extra_actions', label: 'Додаткові дії' },
  { key: 'extra_other_text', label: 'Інша дія (текст)' },
  { key: 'application_yesno', label: 'Заява (так/ні)' },
  { key: 'application_types', label: 'Типи заяв' },
  { key: 'manager_comment', label: 'Коментар менеджера' },
];

const Statistics = () => {
  const [stats, setStats] = useState([]);
  const [chart, setChart] = useState([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [windowId, setWindowId] = useState('');
  const [questionId, setQuestionId] = useState('');
  const [questions, setQuestions] = useState([]);
  const [groupBy, setGroupBy] = useState('hour');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  // Export-specific state (окремо від графіка)
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [exportWindowId, setExportWindowId] = useState('');
  const [exportQuestionId, setExportQuestionId] = useState('');
  const [exportStatus, setExportStatus] = useState('');
  const [exportFields, setExportFields] = useState(() =>
    EXPORT_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: true }), {})
  );

  const questionOptions = useMemo(
    () => questions.map((q) => ({ value: q.id, label: q.text })),
    [questions]
  );

  const fetchQuestions = async () => {
    try {
      const res = await fetch(`${API_URL}/queue/questions`);
      const data = await res.json();
      setQuestions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Помилка завантаження питань:', err);
    }
  };

  const fetchStats = async () => {
    if (!fromDate || !toDate) return;
    const params = new URLSearchParams({ from: fromDate, to: toDate, group_by: groupBy });
    if (windowId) params.append('window_id', windowId);
    if (questionId) params.append('question_id', questionId);
    if (status) params.append('status', status);

    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/queue/stats?${params.toString()}`);
      const data = await res.json();
      setStats(data.stats || []);
      setChart(data.chart || data.byHour || []);
    } catch (err) {
      console.error('Помилка завантаження статистики:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const today = new Date();
    const day = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((day + 6) % 7));
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    const format = (date) => date.toISOString().split('T')[0];
    const from = format(monday);
    const to = format(friday);
    setFromDate(from);
    setToDate(to);
    setExportFrom(from);
    setExportTo(to);
    fetchQuestions();
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fromDate, toDate, windowId, questionId, groupBy, status]);

  const formatValueForExport = (key, val) => {
    if (key === 'status') return STATUS_LABEL[val] || val || '';
    if (key === 'application_yesno') {
      if (val === null || val === undefined) return '';
      return val ? 'Так' : 'Ні';
    }
    if (key === 'application_types' || key === 'extra_actions') {
      try {
        const arr = Array.isArray(val) ? val : JSON.parse(val || '[]');
        return Array.isArray(arr) ? arr.join(', ') : '';
      } catch {
        return val || '';
      }
    }
    return val === null || val === undefined ? '' : val;
  };

  const handleExportXlsx = async () => {
    if (!exportFrom || !exportTo) return;
    const params = new URLSearchParams({ from: exportFrom, to: exportTo, format: 'json' });
    if (exportWindowId) params.append('window_id', exportWindowId);
    if (exportQuestionId) params.append('question_id', exportQuestionId);
    if (exportStatus) params.append('status', exportStatus);

    try {
      const res = await fetch(`${API_URL}/queue/export?${params.toString()}`);
      const data = await res.json();
      const rows = Array.isArray(data?.rows) ? data.rows : [];
      const selected = EXPORT_FIELDS.filter((f) => exportFields[f.key]);
      if (selected.length === 0) {
        alert('Оберіть хоча б одне поле для експорту');
        return;
      }

      const normalized = rows.map((row) => {
        const next = {};
        selected.forEach(({ key, label }) => {
          next[label] = formatValueForExport(key, row[key]);
        });
        return next;
      });

      const ws = XLSX.utils.json_to_sheet(normalized);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Експорт');
      XLSX.writeFile(wb, `queue-export-${exportFrom}-to-${exportTo}.xlsx`);
    } catch (err) {
      console.error('Помилка вигрузки:', err);
    }
  };

  const toggleField = (key) => {
    setExportFields((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAllFields = (checked) => {
    setExportFields(EXPORT_FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: checked }), {}));
  };

  return (
    <div className="statistics">
      <h2>Звіт та статистика</h2>

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
          <input type="number" value={windowId} onChange={(e) => setWindowId(e.target.value)} placeholder="Не обовʼязково" />
        </label>
        <label>
          Питання:
          <select value={questionId} onChange={(e) => setQuestionId(e.target.value)}>
            <option value="">Всі</option>
            {questionOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label>
          Групувати графік:
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            {GROUP_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <label>
          Статус:
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value || 'all'} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      <h3>Агрегована статистика по вікнах:</h3>
      <table>
        <thead>
          <tr>
            <th>Вікно</th>
            <th>Обслугованих клієнтів</th>
            <th>Середній час (хв)</th>
          </tr>
        </thead>
        <tbody>
          {stats.length === 0 ? (
            <tr><td colSpan={3}>Немає даних</td></tr>
          ) : stats.map(row => (
            <tr key={row.window_id}>
              <td>{row.window_id}</td>
              <td>{row.total_clients}</td>
              <td>{row.avg_service_minutes ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="chart-header">
        <h3>Графік завантаження</h3>
        {loading && <span className="hint">Оновлюю...</span>}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chart} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Line type="monotone" dataKey="count" stroke="#8884d8" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>

      <div className="export-card">
        <div className="export-header">
          <div>
            <h3>Експорт .xlsx</h3>
            <p>Окремі фільтри для експорту: діапазон + вікно/питання/статус та обрані поля.</p>
          </div>
          <button onClick={handleExportXlsx} disabled={!exportFrom || !exportTo}>Вигрузити (.xlsx)</button>
        </div>

        <div className="export-grid">
          <div className="export-dates">
            <label>
              З дати:
              <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} />
            </label>
            <label>
              По дату:
              <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} />
            </label>
            <label>
              Вікно:
              <input type="number" value={exportWindowId} onChange={(e) => setExportWindowId(e.target.value)} placeholder="Не обовʼязково" />
            </label>
            <label>
              Питання:
              <select value={exportQuestionId} onChange={(e) => setExportQuestionId(e.target.value)}>
                <option value="">Всі</option>
                {questionOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label>
              Статус:
              <select value={exportStatus} onChange={(e) => setExportStatus(e.target.value)}>
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value || 'all'} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="export-fields">
            <div className="export-fields-header">
              <span>Поля (queue)</span>
              <div className="export-actions">
                <button type="button" onClick={() => toggleAllFields(true)}>Вибрати всі</button>
                <button type="button" onClick={() => toggleAllFields(false)}>Скинути</button>
              </div>
            </div>
            <div className="export-checkboxes">
              {EXPORT_FIELDS.map((f) => (
                <label key={f.key} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={!!exportFields[f.key]}
                    onChange={() => toggleField(f.key)}
                  />
                  <span>{f.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Statistics;
