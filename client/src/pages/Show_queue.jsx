import React, { useState, useEffect, useRef, useContext } from 'react';
import moment from 'moment';
import { createPortal } from 'react-dom';
import './Show_queue.css';
import { WebSocketContext } from '../context/WebSocketProvider.jsx';

const WS_URL = import.meta.env.VITE_WS_URL;

const AVAILABLE_AUDIO = new Set([
  'zaprosuyemo',
  'kliyenta_nomer',
  'do_vikna_nomer',
  ...Array.from({ length: 20 }, (_, i) => `${i + 1}`),
  '30',
  '40',
  '50',
  '60',
  '70',
  '80',
  '90',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900'
]);

const ShowQueue = () => {
  const [time, setTime] = useState('');
  const [weekday, setWeekday] = useState('');
  const [date, setDate] = useState('');
  const [queue, setQueue] = useState([]);
  const [callMessage, setCallMessage] = useState(null);
  const [visible, setVisible] = useState(false);
  const [alarmActive, setAlarmActive] = useState(false);
  const audioQueue = useRef([]);
  const isPlaying = useRef(false);

  const socket = useContext(WebSocketContext);

  const isLiveQueueRecord = (item) =>
    item?.queue_type === 'live' || String(item?.status || '').toLowerCase() === 'live_queue';

  const timeLeftInMinutes = (appointmentTime) => {
    const now = moment();
    const appt = moment(appointmentTime);
    let diff = appt.diff(now, 'minutes');
    if (diff > 0) diff += 1;
    return diff > 0 ? `через ${diff} хв` : 'час минув';
  };

    const updateQueueTiles = (data) => {
    const today = moment().format('YYYY-MM-DD');

    const waiting = data
      .filter(item =>
        !isLiveQueueRecord(item) &&
        item.status === 'waiting' &&
        moment(item.appointment_time).format('YYYY-MM-DD') === today
      )
      .sort((a, b) => moment(a.appointment_time) - moment(b.appointment_time)) // 🟢 Сортуємо по часу
      .slice(0, 11);

    const filled = [
      ...waiting,
      ...Array.from({ length: 11 - waiting.length }, (_, i) => ({ id: `empty-${i}`, empty: true }))
    ];

    setQueue(filled);
  };



  const playAudioSequence = async (files) => {
    isPlaying.current = true;
    for (let i = 0; i < files.length; i++) {
      await new Promise((resolve) => {
        const filename = files[i];
        if (!AVAILABLE_AUDIO.has(filename)) {
          console.warn(`[audio] Файл /audio/${filename}.mp3 відсутній, пропускаю`);
          return resolve();
        }

        const audio = new Audio(`/audio/${filename}.mp3`);
        audio.playbackRate = 1;

        let finished = false;
        const cleanup = () => {
          if (finished) return;
          finished = true;
          clearTimeout(timeoutId);
          setTimeout(resolve, 300);
        };

        audio.onended = cleanup;
        audio.onerror = (err) => {
          console.warn(`[audio] Помилка відтворення ${filename}.mp3`, err);
          cleanup();
        };

        const timeoutId = setTimeout(() => {
          console.warn(`[audio] Таймаут відтворення ${filename}.mp3, переходжу далі`);
          cleanup();
        }, 8000);

        const playPromise = audio.play();
        if (playPromise?.catch) {
          playPromise.catch((err) => {
            console.warn(`[audio] play() rejected для ${filename}.mp3`, err);
            cleanup();
          });
        }
      });
    }
    isPlaying.current = false;
    if (audioQueue.current.length > 0) {
      const next = audioQueue.current.shift();
      enqueueCall(next.queueNumber, next.windowNumber);
    }
  };

  const enqueueCall = (queueNumber, windowNumber) => {
    if (isPlaying.current) {
      audioQueue.current.push({ queueNumber, windowNumber });
      return;
    }
    showCallNotification(queueNumber, windowNumber);
  };

  const playCallAudio = (queueNumber, windowNumber) => {
    const files = ['zaprosuyemo', 'kliyenta_nomer'];

    const addFile = (name) => {
      if (AVAILABLE_AUDIO.has(name)) {
        files.push(name);
      } else {
        console.warn(`[audio] Немає файлу ${name}.mp3, пропускаю`);
      }
    };

    const pushNumber = (num) => {
      let n = Number(num);
      if (!Number.isFinite(n) || n <= 0) return;

      if (n >= 200) {
        console.warn(`[audio] Число ${n} перевищує наявні озвучки, використовую останні дві цифри`);
        n = n % 100 || 100;
      }

      if (n === 100) {
        addFile('100');
        return;
      }

      if (n < 100 && n > 20) {
        const tens = Math.floor(n / 10) * 10;
        const ones = n % 10;
        if (tens) addFile(`${tens}`);
        if (ones) addFile(`${ones}`);
        return;
      }

      if (n <= 20) {
        addFile(`${n}`);
        return;
      }

      // 101–199: "100" + решта
      addFile('100');
      const remainder = n - 100;
      if (remainder > 0) pushNumber(remainder);
    };

    pushNumber(queueNumber);
    files.push('do_vikna_nomer');
    pushNumber(windowNumber);

    playAudioSequence(files);
  };

  const showCallNotification = (queueNumber, windowNumber) => {
    const text = `Запрошуємо споживача номер ${queueNumber} до вікна номер ${windowNumber}`;
    setCallMessage(text);
    setVisible(true);
    playCallAudio(queueNumber, windowNumber);
    setTimeout(() => {
      setVisible(false);
      setTimeout(() => setCallMessage(null), 500);
    }, 7000);
  };

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setWeekday(now.toLocaleDateString('uk-UA', { weekday: 'long' }));
      setDate(now.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' }));
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const res = await fetch(import.meta.env.VITE_API_URL + '/queue');
        const data = await res.json();
        const rows = Array.isArray(data) ? data : data.rows;
        if (Array.isArray(rows)) {
          updateQueueTiles(rows);
        }

        const alarmRes = await fetch(import.meta.env.VITE_API_URL + '/settings/alarm');
        const alarmData = await alarmRes.json();
        setAlarmActive(alarmData.value === 'true')
      } catch (err) {
        console.error('⛔ Помилка при стартовому завантаженні:', err);
      }
    };

    fetchInitialData();
  }, []);
  
  useEffect(() => {
    if (!socket) return;

    const handleMessage = async (event) => {
      console.log('[WS]', event.data);
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'queue_updated') {
          const res = await fetch(`${import.meta.env.VITE_API_URL}/queue`);
          const data = await res.json();
          const rows = Array.isArray(data) ? data : data.rows;
          if (Array.isArray(rows)) {
            updateQueueTiles(rows);
          }
        }

        if (msg.type === 'client_called') {
          const { queue_number, window_number } = msg.data;
          enqueueCall(queue_number, window_number);
        }

        if (msg.type === 'alarm_updated') {
          setAlarmActive(msg.value === 'true' || msg.value === true);
        }
      } catch (err) {
        console.error('⛔️ WebSocket/fetch помилка:', err);
      }
    };

    socket.addEventListener('message', handleMessage);
    return () => socket.removeEventListener('message', handleMessage);
  }, [socket]);

  return (
    <>
      {callMessage &&
        createPortal(
          <div className={`showq-call-banner ${visible ? 'visible' : ''}`}>{callMessage}</div>,
          document.getElementById('overlay-root')
        )}
      {alarmActive &&
        createPortal(
          <div className="showq-alarm-banner">🔴 УВАГА! Повітряна тривога!</div>,
          document.getElementById('overlay-root')
        )
      }
      <div className="showq-grid">
        <div className="showq-card showq-info-card">
          <div className="showq-info-time">{time}</div>
          <div className="showq-info-weekday">{weekday}</div>
          <div className="showq-info-date">{date}</div>
          <div className="showq-info-org">
            ТОВ «ЄВРО-РЕКОНСТРУКЦІЯ»<br />
            Центр обслуговування споживачів
          </div>
        </div>

        {queue.map((item, index) => {
          const number = item.ticket_number || item.queue_number || item.id;
          return (
            <div
              key={item.id || index}
              className={`showq-card ${item.empty ? 'showq-empty-card' : ''}`}
            >
              {!item.empty && (
                <div className="showq-card-content">
                  <div className="showq-time">{moment(item.appointment_time).format('HH:mm')}</div>
                  <div className="showq-number">#{number}</div>
                  <div className="showq-left">{timeLeftInMinutes(item.appointment_time)}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
};

export default ShowQueue;
