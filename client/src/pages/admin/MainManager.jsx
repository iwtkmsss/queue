import React, { useState, useEffect } from 'react';
import EmployeeEditModal from './EmployeeEditModal';

const API_URL = import.meta.env.VITE_API_URL;

const MainManager = ({
  name,
  setName,
  position,
  setPosition,
  newPassword,
  setNewPassword,
  positions,
  handleSubmit,
  employees,
  handleReload,
  loading,
  getStatusColorClass,
}) => {
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [questions, setQuestions] = useState([]);

  useEffect(() => {
    fetch(`${API_URL}/questions`)
      .then(res => res.json())
      .then(setQuestions)
      .catch(() => {});
  }, []);

  const isManager = (pos) => (pos || '').toLowerCase().includes('менедж');

  return (
    <>
      <div className="admin-form-container">
        <h2>Додати співробітника</h2>
        <form onSubmit={handleSubmit} className="admin-form">
          <input
            type="text"
            placeholder="Ім'я"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          >
            <option value="" disabled hidden>Оберіть посаду</option>
            {positions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <input
            type="password"
            placeholder="Пароль"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <button type="submit">Додати</button>
        </form>
      </div>

      <div className="employee-list-container">
        <div className="up-list">
          <h3>Список співробітників</h3>
          <button
            onClick={handleReload}
            disabled={loading}
            className="reload-button"
          >
            {loading ? <span className="spinner" /> : 'Оновити'}
          </button>
        </div>
        <div className="employee-list">
          <table className="employee-table">
            <thead>
              <tr>
                <th>Ім'я</th>
                <th>Посада</th>
                <th>Статус</th>
                <th>Вікно</th>
                <th>Питання</th>
                <th>Дії</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const topics = Array.isArray(emp.topics) ? emp.topics : JSON.parse(emp.topics || '[]');
                return (
                  <tr key={emp.id}>
                    <td>{emp.name}</td>
                    <td>{emp.position}</td>
                <td>
                  {isManager(emp.position) ? (
                    <span className={`status ${getStatusColorClass(emp.status)}`}>
                      {emp.status || '—'}
                    </span>
                  ) : (
                    <span className="status status-muted">—</span>
                  )}
                </td>
                    <td>{emp.window_number || '-'}</td>
                    <td>
                      {questions.length > 0 && topics.length > 0
                        ? topics.map(id => {
                            const q = questions.find(q => q.id === id);
                            return q ? `• ${q.text.slice(0, 10)}...` : null;
                          }).filter(Boolean).join(', ')
                        : '-'}
                    </td>
                    <td>
                      <button onClick={() => setSelectedEmployee(emp)}>⚙️</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedEmployee && (
        <EmployeeEditModal
          employee={selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
          onSave={handleReload}
        />
      )}
    </>
  );
};

export default MainManager;
