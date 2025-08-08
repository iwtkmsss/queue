import React, { useState, useEffect } from 'react';
import { useError } from '../../context/ErrorContext';

import './QuestionsManager.css';

const API_URL = import.meta.env.VITE_API_URL;

const QuestionsManager = () => {
  const { showError } = useError();

  const [questions, setQuestions] = useState([]);
  const [newQuestion, setNewQuestion] = useState('');

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      const res = await fetch(`${API_URL}/questions`);
      const data = await res.json();
      setQuestions(data);
    } catch (error) {
      showError('Помилка завантаження питань');
    }
  };

  const handleAddQuestion = async (e) => {
    e.preventDefault();
    if (!newQuestion.trim()) {
      showError('Текст питання не може бути пустим');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newQuestion.trim() }),
      });

      if (res.ok) {
        setNewQuestion('');
        fetchQuestions();
      } else {
        const data = await res.json();
        showError(data.error || 'Помилка при додаванні питання');
      }
    } catch (error) {
      showError('Помилка сервера при додаванні питання');
    }
  };

  const handleDeleteQuestion = async (id) => {
    try {
      const res = await fetch(`${API_URL}/questions/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchQuestions();
      } else {
        const data = await res.json();
        showError(data.error || 'Помилка при видаленні питання');
      }
    } catch (error) {
      showError('Помилка сервера при видаленні питання');
    }
  };

  return (
    <div className='questions-settings'>
      <h2>Управління питаннями</h2>

      <form onSubmit={handleAddQuestion} className="admin-form" style={{ marginBottom: '2rem' }}>
        <input
          type="text"
          placeholder="Нове питання"
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
        />
        <button type="submit">Додати питання</button>
      </form>

      <h3>Список питань</h3>
      <ul>
        {questions.map((q) => (
          <li key={q.id}>
            {q.text}
            <button onClick={() => handleDeleteQuestion(q.id)} style={{ marginLeft: '10px' }}>
              Видалити
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default QuestionsManager;
