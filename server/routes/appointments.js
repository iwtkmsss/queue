const express = require('express');
const router = express.Router();
const controller = require('../controllers/appointmentsController');

router.get('/today', controller.getTodayAppointments);
router.post('/:id/skip', controller.skipAppointment);
router.post('/:id/start', controller.startAppointment);
router.post('/:id/finish', controller.finishAppointment);
router.post('/:id/did-not-appear', controller.didNotAppear);

module.exports = router;
