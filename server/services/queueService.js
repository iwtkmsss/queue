const db = require('../database');
const moment = require('moment-timezone');

const getAvailableTimes = async (questionId, date) => {
  const serviceDuration = await getServiceDuration();
  const maxWaitMultiplier = await getMaxWaitMultiplier();
  const maxWait = maxWaitMultiplier * serviceDuration;

  const employees = await getEmployeesForQuestion(questionId, date);
  if (!employees.length) return null;

  const lastServiceTimes = await getLastServiceTimesForQuestion(employees, questionId);

  const now = moment().tz('Europe/Kyiv');

  const candidates = [];
  for (const emp of employees) {
    const slots = await getFreeTimeSlotsForEmployee(emp, date, serviceDuration);
    const free = slots.filter(s => !s.taken);

    if (free.length) {
      const first = moment(free[0].time);
      const waitMin = first.diff(now, 'minutes');
      candidates.push({
        emp,
        slots: free,
        waitMin,
        firstSlot: first,
        priority: emp.priority,
        lastTime: lastServiceTimes[emp.id] || 0
      });
    }
  }

  if (!candidates.length) return null;

  // групуємо по пріоритету
  const grouped = {};
  for (const c of candidates) {
    if (!grouped[c.priority]) grouped[c.priority] = [];
    grouped[c.priority].push(c);
  }

  const sortedPriorities = Object.keys(grouped).map(Number).sort((a, b) => b - a);

  for (const priority of sortedPriorities) {
    const group = grouped[priority].sort((a, b) => a.lastTime - b.lastTime);

    for (const cand of group) {

      if (cand.waitMin < 0) {
        continue;
      }

      if (cand.waitMin > maxWait) {
        const hasBetter = sortedPriorities
          .filter(p => p < priority)
          .some(p =>
            grouped[p]?.some(other => other.waitMin >= 0 && other.waitMin <= maxWait)
          );

        if (hasBetter) {
          continue;
        }
      }

      return { employee: cand.emp, timeSlots: cand.slots };
    }
  }

  const fallback = candidates[0];
  return {
    employee: fallback.emp,
    timeSlots: fallback.slots
  };
};



async function getLastServiceTimesForQuestion(employees, questionId) {
  const map = {};
  for (const emp of employees) {
    const row = await db.getAsync(
      `SELECT MAX(created_at) AS last_time FROM queue 
       WHERE window_id = ? AND question_id = ?`,
      [emp.window_number, questionId]
    );
    map[emp.id] = row?.last_time ? new Date(row.last_time).getTime() : 0;
  }
  return map;
}

async function getServiceDuration() {
  const row = await db.getAsync(`SELECT value FROM settings WHERE key = 'service_minutes'`);
  return parseInt(row?.value || '15');
}

async function getEmployeesForQuestion(questionId, date) {
  const rows = await db.allAsync(`SELECT * FROM employees`);
  const filtered = rows
    .map(e => {
      return {
        ...e,
        schedule: JSON.parse(e.schedule || '{}'),
        topics: JSON.parse(e.topics || '[]')
      };
    })
    .filter(e => e.topics.includes(questionId) && e.schedule[date]);
  return filtered;
}

async function getLastServiceTimes(employees, date) {
  const map = {};
  for (const emp of employees) {
    const row = await db.get(
      `SELECT MAX(appointment_time) AS last_time FROM queue WHERE window_id = ? AND DATE(appointment_time) = ?`,
      [emp.window_number, date]
    );
    map[emp.id] = row.last_time ? new Date(row.last_time).getTime() : 0;
  }
  return map;
}

async function getFreeTimeSlotsForEmployee(employee, date, duration) {
  const now = moment().tz('Europe/Kyiv');

  // 1️⃣ Беремо всі зайняті (тільки активні)
  const existing = await db.allAsync(
    `SELECT appointment_time FROM queue
     WHERE window_id = ? AND DATE(appointment_time) = ?
     AND status IN ('waiting', 'in_progress')`,
    [employee.window_number, date]
  );

  const busyTimes = new Set(
    existing.map(row => moment(row.appointment_time).format('HH:mm'))
  );
  // 2️⃣ Графік дня
  const daySchedule = employee.schedule[date];
  if (!daySchedule || !daySchedule.start || !daySchedule.end) {
    return [];
  }

  const start = moment.tz(`${date} ${daySchedule.start}`, 'YYYY-MM-DD HH:mm', 'Europe/Kyiv');
  const end = moment.tz(`${date} ${daySchedule.end}`, 'YYYY-MM-DD HH:mm', 'Europe/Kyiv');


  const timeSlots = [];
  let current = start.clone();

  while (current.isBefore(end)) {
    const slotTime = current.format('HH:mm');
    
    if (current.isSameOrAfter(now)) {
      if (busyTimes.has(slotTime)) {
      } else {
        timeSlots.push({
          time: current.toISOString(),
          taken: false,
        });
      }
    }

    current.add(duration, 'minutes');
  }

  return timeSlots;
}


async function getQuestions() {
  const rows = await db.allAsync(`SELECT id, text FROM questions ORDER BY id`);
  return rows;
}

const getAvailableDates = async (questionId) => {
  const allEmployees = await db.allAsync(`SELECT * FROM employees`);
  const today = new Date();
  const dates = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const day = d.getDay();

    if (day === 0 || day === 6) continue;

    const dateStr = d.toISOString().split('T')[0];

    const hasEmployee = allEmployees.some((e) => {
      const schedule = JSON.parse(e.schedule || '{}');
      const topics = JSON.parse(e.topics || '[]');
      return topics.includes(questionId) && schedule[dateStr];
    });

    if (hasEmployee) dates.push(dateStr);
  }

  return dates;
};

async function getMaxWaitMultiplier() {
  const row = await db.getAsync(`SELECT value FROM settings WHERE key = 'max_wait_multiplier'`);
  return Number(row?.value || 4);
}

const createQueueRecord = async ({ question_id, appointment_time, window_id }) => {
  const status = 'waiting';
  const created_at = moment().tz('Europe/Kyiv').format('YYYY-MM-DD HH:mm:ss');

  const result = await db.runAsync(
    `INSERT INTO queue (question_id, appointment_time, window_id, status, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [question_id, appointment_time, window_id, status, created_at]
  );

  return {
    id: result.lastID,
    question_id,
    appointment_time,
    window_id,
    status,
    created_at
  };
};

module.exports = {
  getAvailableTimes,
  getQuestions,
  getAvailableDates,
  createQueueRecord
};
