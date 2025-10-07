import React, { useEffect, useState, useContext } from 'react';
import './Queue.css';
import moment from 'moment-timezone';
import { WebSocketContext } from '../context/WebSocketProvider';

const API_URL = import.meta.env.VITE_API_URL;
const PRINTER_URL = import.meta.env.VITE_PRINTER_URL;

const getCurrentWeekdays = () => {
  const today = new Date();
  const days = [];
  const day = today.getDay();
  const monday = new Date(today);

  monday.setDate(today.getDate() - ((day + 6) % 7)); // понеділок

  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d.toISOString().split('T')[0]);
  }

  return days;
};

const Queue = () => {
  const [questions, setQuestions] = useState([]);
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const [screen, setScreen] = useState(1);

  const [weekDays, setWeekDays] = useState([]);
  const [slotsByDay, setSlotsByDay] = useState({});
  const [selectedSlot, setSelectedSlot] = useState('');
  const [selectedWindow, setSelectedWindow] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [now, setNow] = useState(new Date());

  const socket = useContext(WebSocketContext);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/queue/questions`)
      .then(res => res.json())
      .then(data => setQuestions(data));
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'queue_updated') {
        fetch(`${API_URL}/queue/questions`)
          .then(res => res.json())
          .then(setQuestions);

        if (selectedQuestionId) {
          const weekdays = getCurrentWeekdays();
          setWeekDays(weekdays);

          weekdays.forEach((day) => {
            fetch(`${API_URL}/queue/available-times?question_id=${selectedQuestionId}&date=${day}`)
              .then(res => res.ok ? res.json() : null)
              .then(data => {
                if (!data) return;
                setSlotsByDay(prev => ({
                  ...prev,
                  [day]: {
                    slots: data.timeSlots || [],
                    window: data.employee?.window_number || null
                  }
                }));
              })
              .catch(console.error);
          });
        }
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket, selectedQuestionId]);

  useEffect(() => {
    if (selectedQuestionId) {
      const weekdays = getCurrentWeekdays();
      setWeekDays(weekdays);

      weekdays.forEach((day) => {
        fetch(`${API_URL}/queue/available-times?question_id=${selectedQuestionId}&date=${day}`)
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (!data) return;
            setSlotsByDay(prev => ({
              ...prev,
              [day]: {
                slots: data.timeSlots || [],
                window: data.employee?.window_number || null
              }
            }));
          })
          .catch(console.error);
      });
    }
  }, [selectedQuestionId]);

  const handleSubmit = async () => {
    if (!selectedSlot || !selectedWindow) return;

    const appointment_time_req = moment.tz(selectedSlot, 'Europe/Kyiv')
      .format('YYYY-MM-DD HH:mm:ss');

    const res = await fetch(`${API_URL}/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question_id: selectedQuestionId,
        appointment_time: appointment_time_req,
        window_id: selectedWindow
      })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('Помилка створення талона:', res.status, text);
      return;
    }

    const result = await res.json();
    setConfirmation(result);

    const appointment = moment.tz(result.appointment_time, 'Europe/Kyiv');
    const payload = {
      number: result.id,
      recordDate: appointment.format('YYYY-MM-DD'),
      recordTime: appointment.format('HH:mm')
    };

    try {
      if (!PRINTER_URL) {
        console.error('VITE_PRINTER_URL не задано — друк пропущено');
        return;
      }
      const pr = await fetch(`${PRINTER_URL}/print-ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!pr.ok) {
        const text = await pr.text().catch(() => '');
        console.error('Помилка виклику друку:', pr.status, text, 'payload=', payload);
      }
    } catch (err) {
      console.error('Помилка мережі при друку:', err, 'payload=', payload);
    }
  };

  useEffect(() => {
    if (!confirmation) return;

    const timeout = setTimeout(() => {
      setConfirmation(null);
      setScreen(1);
      setSelectedQuestionId(null);
      setSlotsByDay({});
      setSelectedSlot('');
      setSelectedWindow(null);
    }, 10000);

    return () => clearTimeout(timeout);
  }, [confirmation]);

  if (confirmation) {
    return (
      <div className="confirmation">
        <h2>Ваш талон створено!</h2>
        <p>Дата: {confirmation.appointment_time.slice(0, 10)}</p>
        <p>Час: {new Date(confirmation.appointment_time).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}</p>
        <p>Номер талону: {confirmation.id}</p>

        <button
          onClick={() => {
            setConfirmation(null);
            setScreen(1);
            setSelectedQuestionId(null);
            setSlotsByDay({});
            setSelectedSlot('');
            setSelectedWindow(null);
          }}
          style={{
            marginTop: '20px',
            padding: '12px 24px',
            fontSize: '16px',
            border: 'none',
            borderRadius: '8px',
            backgroundColor: '#007bff',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          Повернутися в меню
        </button>
      </div>
    );
  }

  if (screen === 1) {
    return (
      <div className="welcome-screen">
        <h1>Вас вітає центр обслуговування споживачів</h1>
        <h2>ТОВ «ЄВРО-РЕКОНСТРУКЦІЯ»</h2>
        <p className="instruction">Виберіть питання:</p>
        <div className="questions-grid">
          {questions.map((q) => (
            <button
              key={q.id}
              className="question-button"
              onClick={() => {
                setSelectedQuestionId(q.id);
                setScreen(2);
              }}
            >
              {q.text}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="time-selection">
      <h2>Виберіть зручний час</h2>
      <div className="days-row">
      {weekDays
        .filter((day) => {
          const slots = slotsByDay[day]?.slots || [];
          // Показуй тільки, якщо є хоча б 1 слот, який не зайнятий
          return slots.some(s => !(s.taken || s.skipped));
        })
        .map((day) => {
          const slots = slotsByDay[day]?.slots || [];
          const windowId = slotsByDay[day]?.window || null;
          const dayName = new Date(day).toLocaleDateString('uk-UA', { weekday: 'long' });

          return (
            <div key={day} className="day-column">
              <div className="day-name">{dayName}</div>
              <div className="day-date">{day}</div>
              <div className="time-slots">
                {slots.length > 0 ? (
                  slots.map(slotObj => {
                    const slot = typeof slotObj === 'string' ? { time: slotObj, taken: false } : slotObj;
                    const isTaken = slot.taken || slot.skipped;
                    const slotDate = new Date(slot.time);
                    const isPast = slotDate < now;
                    const isDisabled = isTaken || isPast;

                    let slotTime = 'Невірний час';
                    if (!isNaN(slotDate)) {
                      slotTime = slotDate.toLocaleTimeString('uk-UA', {
                        hour: '2-digit',
                        minute: '2-digit'
                      });
                    }
                    return (
                      <button
                        key={slot.time}
                        className={`slot-button ${isDisabled ? 'disabled' : ''} ${selectedSlot === slot.time ? 'active' : ''}`}
                        disabled={isDisabled}
                        style={isDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                        onClick={() => {
                          if (!isDisabled) {
                            setSelectedSlot(slot.time);
                            setSelectedWindow(windowId);
                          }
                        }}
                      >
                        {slotTime}
                      </button>
                    );
                  })
                ) : (
                  <div className="no-slots">Немає вільного часу</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="time-actions">
        <button
          onClick={() => {
            setScreen(1);
            setSelectedQuestionId(null);
            setSlotsByDay({});
            setSelectedSlot('');
            setSelectedWindow(null);
          }}
        >
          Назад
        </button>
        <button
          onClick={handleSubmit}
          disabled={!selectedSlot}
          className={!selectedSlot ? 'disabled' : ''}
        >
          Підтвердити звернення
        </button>
      </div>
    </div>
  );
};

export default Queue;
