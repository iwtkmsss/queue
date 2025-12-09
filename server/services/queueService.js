const db = require('../database');
const moment = require('moment-timezone');
const scheduleService = require('./scheduleService');


// ==============================
//  ОБІДНЯ ПЕРЕРВА (settings)
// ==============================

async function getLunchSettings() {
  const startRow = await db.getAsync(
    "SELECT value FROM settings WHERE key = 'lunch_start'"
  );
  const endRow = await db.getAsync(
    "SELECT value FROM settings WHERE key = 'lunch_end'"
  );

  return {
    start: startRow?.value || null,
    end: endRow?.value || null,
  };
}

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
  const enriched = rows
    .map(e => ({
      ...e,
      topics: JSON.parse(e.topics || '[]')
    }))
    .filter(e => e.topics.includes(questionId));

  const scheduleMap = await scheduleService.getSchedulesForEmployees(enriched, date);

  return enriched
    .map(e => ({
      ...e,
      scheduleForDate: scheduleMap.get(e.id) || null,
    }))
    .filter(e => e.scheduleForDate && e.scheduleForDate.start && e.scheduleForDate.end);
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
  const daySchedule = employee.scheduleForDate;
  if (!daySchedule || !daySchedule.start || !daySchedule.end) {
    return [];
  }

  const start = moment.tz(`${date} ${daySchedule.start}`, 'YYYY-MM-DD HH:mm', 'Europe/Kyiv');
  const end = moment.tz(`${date} ${daySchedule.end}`, 'YYYY-MM-DD HH:mm', 'Europe/Kyiv');

  // 3️⃣ Обідня перерва для цього дня
  const lunch = await getLunchSettings();
  let lunchStart = null;
  let lunchEnd = null;

  if (lunch.start && lunch.end) {
    lunchStart = moment.tz(`${date} ${lunch.start}`, 'YYYY-MM-DD HH:mm', 'Europe/Kyiv');
    lunchEnd = moment.tz(`${date} ${lunch.end}`, 'YYYY-MM-DD HH:mm', 'Europe/Kyiv');
  }

  const timeSlots = [];
  let current = start.clone();

  while (current.isBefore(end)) {
    const slotTime = current.format('HH:mm');

    // 🔥 пропускаємо слот, якщо він потрапляє в обідню перерву
    if (
      lunchStart &&
      lunchEnd &&
      current.isSameOrAfter(lunchStart) &&
      current.isBefore(lunchEnd)
    ) {
      current.add(duration, 'minutes');
      continue;
    }

    if (current.isSameOrAfter(now)) {
      if (busyTimes.has(slotTime)) {
        // зайнятий — просто не додаємо
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

    const withTopic = allEmployees
      .map((e) => ({
        ...e,
        topics: JSON.parse(e.topics || '[]'),
      }))
      .filter((e) => e.topics.includes(questionId));

    if (!withTopic.length) continue;

    const scheduleMap = await scheduleService.getSchedulesForEmployees(withTopic, dateStr);
    const hasEmployee = withTopic.some((e) => {
      const s = scheduleMap.get(e.id);
      return s && s.start && s.end;
    });

    if (hasEmployee) dates.push(dateStr);
  }

  return dates;
};

async function getMaxWaitMultiplier() {
  const row = await db.getAsync(`SELECT value FROM settings WHERE key = 'max_wait_multiplier'`);
  return Number(row?.value || 4);
}

async function getNextTicketNumber(appointmentTime) {
  const appt = moment.tz(appointmentTime, 'YYYY-MM-DD HH:mm:ss', 'Europe/Kyiv');
  const startWeek = appt.clone().startOf('isoWeek').format('YYYY-MM-DD HH:mm:ss');
  const endWeek = appt.clone().endOf('isoWeek').format('YYYY-MM-DD HH:mm:ss');

  const row = await db.getAsync(
    `SELECT MAX(ticket_number) AS max_num FROM queue WHERE appointment_time BETWEEN ? AND ?`,
    [startWeek, endWeek]
  );

  return (row?.max_num || 0) + 1;
}

const createQueueRecord = async ({ question_id, question_text, appointment_time, window_id }) => {
  const status = 'waiting';
  const created_at = moment().tz('Europe/Kyiv').format('YYYY-MM-DD HH:mm:ss');
  const ticket_number = await getNextTicketNumber(appointment_time);

  const result = await db.runAsync(
    `INSERT INTO queue (question_id, question_text, appointment_time, window_id, status, created_at, ticket_number)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [question_id, question_text || null, appointment_time, window_id, status, created_at, ticket_number]
  );

  return {
    id: result.lastID,
    ticket_number,
    question_id,
    question_text: question_text || null,
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
