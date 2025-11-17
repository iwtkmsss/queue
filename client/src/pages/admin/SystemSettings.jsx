import React, { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL;

export default function SystemSettings() {
  const [serviceMinutes, setServiceMinutes] = useState('20');
  const [alarmActive, setAlarmActive] = useState('false');
  const [maxWait, setMaxWait] = useState('5');

  // 🟢 НОВЕ: обідня перерва
  const [lunchStart, setLunchStart] = useState('');
  const [lunchEnd, setLunchEnd] = useState('');

  useEffect(() => {
    // GET service_minutes
    fetch(`${API_URL}/settings/service_minutes`)
      .then(res => res.json())
      .then(data => setServiceMinutes(data.value || '20'));

    // GET alarm_active
    fetch(`${API_URL}/settings/alarm_active`)
      .then(res => res.json())
      .then(data => setAlarmActive(data.value || 'false'));

    // GET max_wait_multiplier
    fetch(`${API_URL}/settings/max_wait_multiplier`)
      .then(res => res.json())
      .then(data => setMaxWait(data.value || '5'));

    // 🟢 GET lunch settings
    fetch(`${API_URL}/settings/lunch`)
      .then(res => res.json())
      .then(data => {
        setLunchStart(data.start || '');
        setLunchEnd(data.end || '');
      });
  }, []);

  const handleSave = async () => {
    const requests = [];

    // 1️⃣ Зберегти service_minutes
    requests.push(
      fetch(`${API_URL}/settings/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'service_minutes',
          value: serviceMinutes,
        }),
      })
    );

    // 2️⃣ Зберегти alarm
    requests.push(
      fetch(`${API_URL}/settings/alarm`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: alarmActive }),
      })
    );

    // 3️⃣ Зберегти max_wait_multiplier
    requests.push(
      fetch(`${API_URL}/settings/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'max_wait_multiplier',
          value: maxWait,
        }),
      })
    );

    // 4️⃣ 🟢 Зберегти lunch_start та lunch_end
    requests.push(
      fetch(`${API_URL}/settings/lunch`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: lunchStart,
          end: lunchEnd,
        }),
      })
    );

    try {
      await Promise.all(requests);
      alert('Налаштування збережено!');
    } catch (err) {
      console.error('Помилка при збереженні:', err);
      alert('Щось пішло не так при збереженні');
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '0 auto' }}>
      <h2>🔧 Системні налаштування</h2>

      {/* ======================= service_minutes ======================= */}
      <div style={{ marginBottom: '10px' }}>
        <label>
          ⏱️ Тривалість обслуговування (хв):
          <input
            type="number"
            value={serviceMinutes}
            onChange={(e) => setServiceMinutes(e.target.value)}
            min="1"
            style={{ marginLeft: '10px', padding: '4px', width: '60px' }}
          />
        </label>
      </div>

      {/* ======================= alarm_active ======================= */}
      <div style={{ marginBottom: '10px' }}>
        <label>
          🚨 Тривога активна:
          <select
            value={alarmActive}
            onChange={(e) => setAlarmActive(e.target.value)}
            style={{ marginLeft: '10px', padding: '4px' }}
          >
            <option value="true">Так</option>
            <option value="false">Ні</option>
          </select>
        </label>
      </div>

      {/* ======================= max_wait_multiplier ======================= */}
      <div style={{ marginBottom: '10px' }}>
        <label>
          ⏳ Макс. множник очікування:
          <input
            type="number"
            value={maxWait}
            onChange={(e) => setMaxWait(e.target.value)}
            min="1"
            style={{ marginLeft: '10px', padding: '4px', width: '60px' }}
          />
        </label>
      </div>

      {/* ======================= LUNCH SETTINGS ======================= */}
      <div style={{ marginBottom: '10px' }}>
        <label>
          🍽️ Початок обіду:
          <input
            type="time"
            value={lunchStart}
            onChange={(e) => setLunchStart(e.target.value)}
            style={{ marginLeft: '10px', padding: '4px' }}
          />
        </label>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <label>
          🍽️ Кінець обіду:
          <input
            type="time"
            value={lunchEnd}
            onChange={(e) => setLunchEnd(e.target.value)}
            style={{ marginLeft: '10px', padding: '4px' }}
          />
        </label>
      </div>

      <button onClick={handleSave} style={{ padding: '8px 16px' }}>
        💾 Зберегти
      </button>
    </div>
  );
}
