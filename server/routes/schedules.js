const express = require('express');
const router = express.Router();
const controller = require('../controllers/scheduleController');

router.get('/', controller.listSchedules);
router.get('/for-date', controller.getScheduleForDate);
router.post('/', controller.createSchedule);

module.exports = router;
