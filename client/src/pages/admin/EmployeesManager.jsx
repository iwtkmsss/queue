import React, { useState, useEffect } from 'react';
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
      setEmployees(data);
    } catch (error) {
      showError('Помилка завантаження співробітників');
    }
  };

  const fetchQuestions = async () => {
    try {
      const res = await fetch(`${API_URL}/questions`);
      const data = await res.json();
      setQuestions(data);
    } catch (error) {
      showError('Помилка завантаження питань');
    }
  };

  const handleSave = async (employee) => {
    try {
      setLoading(true);

      const res = await fetch(`${API_URL}/employees/${employee.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          window_number: employee.window_number,
          topics: employee.topics,
        }),
      });

      if (res.ok) {
        fetchEmployees();
      } else {
        const data = await res.json();
        showError(data.error || 'Помилка при збереженні змін');
      }
    } catch (error) {
      showError('Помилка сервера при збереженні змін');
    } finally {
      setLoading(false);
    }
  };

  const handleTopicChange = (e, employeeId) => {
    const { options } = e.target;
    const selectedTopics = [];

    for (const option of options) {
      if (option.selected) {
        selectedTopics.push(parseInt(option.value));
      }
    }

    setEmployees((prev) =>
      prev.map((emp) =>
        emp.id === employeeId ? { ...emp, topics: selectedTopics } : emp
      )
    );
  };

  const handleWindowChange = (e, employeeId) => {
    const windowNumber = parseInt(e.target.value);
    setEmployees((prev) =>
      prev.map((emp) =>
        emp.id === employeeId ? { ...emp, window_number: windowNumber } : emp
      )
    );
  };

  return (
    <div>
      <h2>Управління співробітниками</h2>

      {employees.map((emp) => (
        <div key={emp.id} className="employee-card">
          <h4>{emp.name} — {emp.position}</h4>

          <label>
            Номер вікна:
            <input
              type="number"
              value={emp.window_number || ''}
              onChange={(e) => handleWindowChange(e, emp.id)}
              style={{ marginLeft: '10px' }}
            />
          </label>

          <br />

          <label>
            Питання:
            <select
              multiple
              value={emp.topics || []}
              onChange={(e) => handleTopicChange(e, emp.id)}
              style={{ width: '100%', height: '100px', marginTop: '5px' }}
            >
              {questions.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.text}
                </option>
              ))}
            </select>
          </label>
          
          <br />
          <h5>Графік роботи на тиждень</h5>
<table className="schedule-table">
  <thead>
    <tr>
      <th>День</th>
      <th>Початок</th>
      <th>Кінець</th>
    </tr>
  </thead>
  <tbody>
    {['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map((day) => (
      <tr key={day}>
        <td>{day.charAt(0).toUpperCase() + day.slice(1)}</td>
        <td>
          <input
            type="time"
            value={emp.schedule?.[day]?.start || ''}
            onChange={(e) => {
              const updated = {
                ...emp.schedule,
                [day]: {
                  ...(emp.schedule?.[day] || {}),
                  start: e.target.value
                },
              };
              setEmployees((prev) =>
                prev.map((el) =>
                  el.id === emp.id ? { ...el, schedule: updated } : el
                )
              );
            }}
          />
        </td>
        <td>
          <input
            type="time"
            value={emp.schedule?.[day]?.end || ''}
            onChange={(e) => {
              const updated = {
                ...emp.schedule,
                [day]: {
                  ...(emp.schedule?.[day] || {}),
                  end: e.target.value
                },
              };
              setEmployees((prev) =>
                prev.map((el) =>
                  el.id === emp.id ? { ...el, schedule: updated } : el
                )
              );
            }}
          />
        </td>
      </tr>
    ))}
  </tbody>
</table>

          <br />

          <button
            onClick={() => handleSave(emp)}
            disabled={loading}
            style={{ marginTop: '10px' }}
          >
            {loading ? 'Збереження...' : 'Зберегти зміни'}
          </button>

          <hr />
        </div>
      ))}
    </div>
  );
};

export default EmployeesManager;
