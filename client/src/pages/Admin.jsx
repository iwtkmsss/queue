import React, { useState, useEffect, useContext } from 'react';
import { useError } from '../context/ErrorContext';
import { WebSocketContext } from '../context/WebSocketProvider';

import MainManager from './admin/MainManager';
import QueueManager from './admin/QueueManager';
import QuestionsManager from './admin/QuestionsManager';
import ServiceSettings from './admin/SystemSettings';
import Statistics from './admin/Statistics';

import './Admin.css';

const API_URL = import.meta.env.VITE_API_URL;

const Admin = () => {
  const positions = ['Адміністратор', 'Диспетчер', 'Менеджер'];
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [loginData, setLoginData] = useState({ name: '', password: '', expectedPosition: 'Адміністратор' });

  const [employees, setEmployees] = useState([]);
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [section, setSection] = useState('main');
  const [loading, setLoading] = useState(false);

  const { showError } = useError();

  const socket = useContext(WebSocketContext);

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'update_employees') {
        console.log('🔔 Оновлення списку працівників');
        fetchEmployees();
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket]);

  useEffect(() => {
    if (token) {
      setIsAuthenticated(true);
      fetchEmployees();
    }
  }, [token]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
    setIsAuthenticated(false);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData),
      });

      let data = {};
      try {
        data = await res.json();
      } catch (jsonError) {
        console.warn('Не вдалося розпарсити JSON:', jsonError);
      }

      if (res.ok) {
        if (data.token) {
          localStorage.setItem('token', data.token);
          setToken(data.token);
          setIsAuthenticated(true);
        } else {
          showError('Сервер не повернув токен');
        }
      } else {
        showError(data.error || `Помилка авторизації (код: ${res.status})`);
      }
    } catch (err) {
      showError('Не вдалося зʼєднатися з сервером. Спробуйте пізніше.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !position.trim() || !newPassword.trim()) {
      showError("Будь ласка, заповніть усі поля (Імʼя, Посада, Пароль)");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/employees`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, position, password: newPassword }),
      });

      if (res.ok) {
        setName('');
        setPosition('');
        setNewPassword('');
        fetchEmployees();
      } else {
        const data = await res.json();
        showError(data.error || 'Помилка при додаванні співробітника');
      }
    } catch {
      showError('Серверна помилка при додаванні');
    }
  };

  const handleReload = async () => {
    setLoading(true);
    try {
      await fetchEmployees();
    } catch (error) {
      showError(error.message || 'Сталася помилка при оновленні даних');
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await fetch(`${API_URL}/employees`);
      const data = await res.json();
      setEmployees(data);
    } catch {
      showError('Не вдалося завантажити співробітників');
    }
  };

  const getStatusColorClass = (status) => {
    switch (status) {
      case 'Працює': return 'practiong';
      case 'Очікує': return 'awaiting';
      case 'Не працює': return 'not-working';
      default: return '';
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="admin-container">
        <h2>Вхід в адмінку</h2>
        <form onSubmit={handleLogin} className="admin-form">
          <input
            type="text"
            placeholder="Імʼя"
            value={loginData.name}
            onChange={(e) => setLoginData({ ...loginData, name: e.target.value })}
          />
          <input
            type="password"
            placeholder="Пароль"
            value={loginData.password}
            onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
          />
          <button type="submit">Увійти</button>
        </form>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <div className="admin-header">
        <div className="admin-nav">
          <button onClick={() => setSection('main')}>Управління співробітниками</button>
          <button onClick={() => setSection('queue')}>Черга</button>
          <button onClick={() => setSection('stats')}>Статистика</button>
          <button onClick={() => setSection('settings')}>Налаштування</button>
          <button className="logout-btn" onClick={handleLogout}>Вийти</button>
        </div>
      </div>

      {section === 'main' && (
        <MainManager
          name={name}
          setName={setName}
          position={position}
          setPosition={setPosition}
          newPassword={newPassword}
          setNewPassword={setNewPassword}
          positions={positions}
          handleSubmit={handleSubmit}
          employees={employees}
          handleReload={handleReload}
          loading={loading}
          getStatusColorClass={getStatusColorClass}
        />
      )}
      {section === 'queue' && <QueueManager />}
      {section === 'stats' && <Statistics />}
      {section === 'settings' && (
        <>
          <QuestionsManager />
          <hr style={{ margin: '20px 0' }} />
          <ServiceSettings />
        </>
      )}
    </div>
  );
};

export default Admin;
