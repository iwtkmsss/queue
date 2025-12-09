import React, { useEffect, useState } from 'react';
import { useError } from '../../context/ErrorContext';

const API_URL = import.meta.env.VITE_API_URL;

const EmployeesManager = () => {
  const { showError } = useError();
  const [employees, setEmployees] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchEmployees();
    fetchQuestions();
  }, []);

  const fetchEmployees = async () => {
    try {
      const res = await fetch(`${API_URL}/employees`);
      const data = await res.json();
      const normalized = Array.isArray(data)
        ? data.map((emp) => {
            let topics = [];
            if (Array.isArray(emp.topics)) {
              topics = emp.topics;
            } else {
              try {
                topics = JSON.parse(emp.topics || '[]');
              } catch {
                topics = [];
              }
            }
            return { ...emp, topics };
          })
        : [];
      setEmployees(normalized);
    } catch (err) {
      showError('Не вдалося завантажити співробітників');
    }
  };

  const fetchQuestions = async () => {
    try {
      const res = await fetch(`${API_URL}/questions`);
      const data = await res.json();
      setQuestions(data);
    } catch (err) {
      showError('Не вдалося завантажити теми');
    }
  };

  const handleWindowChange = (value, employeeId) => {
    const windowNumber = value ? parseInt(value, 10) : null;
    setEmployees((prev) =>
      prev.map((emp) =>
        emp.id === employeeId ? { ...emp, window_number: windowNumber } : emp
      )
    );
  };

  const handlePriorityToggle = (checked, employeeId) => {
    setEmployees((prev) =>
      prev.map((emp) =>
        emp.id === employeeId ? { ...emp, priority: checked ? 1 : 0 } : emp
      )
    );
  };

  const handleTopicChange = (e, employeeId) => {
    const { options } = e.target;
    const selected = [];
    for (const option of options) {
      if (option.selected) selected.push(Number(option.value));
    }
    setEmployees((prev) =>
      prev.map((emp) => (emp.id === employeeId ? { ...emp, topics: selected } : emp))
    );
  };

  const handleSave = async (employee) => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/employees/${employee.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          window_number: employee.window_number,
          topics: employee.topics,
          priority: employee.priority || 0,
        }),
      });

      if (res.ok) {
        fetchEmployees();
      } else {
        const data = await res.json();
        showError(data.error || 'Не вдалося зберегти співробітника');
      }
    } catch (err) {
      showError('Не вдалося зберегти співробітника');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Співробітники</h2>
      {employees.map((emp) => (
        <div key={emp.id} className="employee-card" style={{ marginBottom: '16px' }}>
          <h4>{emp.name} - {emp.position}</h4>

          <label style={{ display: 'block', marginBottom: '8px' }}>
            Номер вікна:
            <input
              type="number"
              value={emp.window_number ?? ''}
              onChange={(e) => handleWindowChange(e.target.value, emp.id)}
              style={{ marginLeft: '8px', width: '80px' }}
            />
          </label>

          <label style={{ display: 'block', marginBottom: '8px' }}>
            <input
              type="checkbox"
              checked={emp.priority === 1}
              onChange={(e) => handlePriorityToggle(e.target.checked, emp.id)}
            />
            <span style={{ marginLeft: '6px' }}>Високий пріоритет</span>
          </label>

          <label style={{ display: 'block', marginBottom: '8px' }}>
            Теми:
            <select
              multiple
              value={emp.topics || []}
              onChange={(e) => handleTopicChange(e, emp.id)}
              style={{ width: '100%', height: '100px', marginTop: '4px' }}
            >
              {questions.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.text}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={() => handleSave(emp)}
            disabled={loading}
            style={{ marginTop: '8px' }}
          >
            {loading ? 'Збереження...' : 'Зберегти'}
          </button>

          <hr />
        </div>
      ))}
    </div>
  );
};

export default EmployeesManager;
