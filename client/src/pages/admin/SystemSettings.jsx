import React, { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL;

export default function SystemSettings() {
  const [serviceMinutes, setServiceMinutes] = useState('20');
  const [alarmActive, setAlarmActive] = useState('false');
  const [maxWait, setMaxWait] = useState('5');
  const [lunchDuration, setLunchDuration] = useState('60');

  useEffect(() => {
    fetch(`${API_URL}/settings/service_minutes`)
      .then(res => res.json())
      .then(data => setServiceMinutes(data.value || '20'));

    fetch(`${API_URL}/settings/alarm_active`)
      .then(res => res.json())
      .then(data => setAlarmActive(data.value || 'false'));

    fetch(`${API_URL}/settings/max_wait_multiplier`)
      .then(res => res.json())
      .then(data => setMaxWait(data.value || '5'));

    fetch(`${API_URL}/settings/lunch_duration`)
      .then(res => res.json())
      .then(data => setLunchDuration(data.value || '60'));

  }, []);

  const handleSave = async () => {
    const requests = [];

    // 1️⃣ Звичайний service_duration — універсальний POST
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

    // 2️⃣ alarm_active — окремий PATCH
    requests.push(
      fetch(`${API_URL}/settings/alarm`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: alarmActive }),
      })
    );

    // 3️⃣ max_wait_multiplier — теж універсальний POST
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

      <div style={{ marginBottom: '10px' }}>
        <label>
          🍽️ Час обіду (хв):
          <input
            type="number"
            value={lunchDuration}
            onChange={(e) => setLunchDuration(e.target.value)}
            min="1"
            style={{ marginLeft: '10px', padding: '4px', width: '60px' }}
          />
        </label>
      </div>

      <button onClick={handleSave} style={{ padding: '8px 16px' }}>
        💾 Зберегти
      </button>
    </div>
  );
}
