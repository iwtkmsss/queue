const express = require('express');
const router = express.Router();
const queueController = require('../controllers/queueController');

router.get('/', queueController.getAllQueue);
router.post('/', queueController.createQueueRecord);
router.patch('/status', queueController.updateQueueStatus);
router.patch('/reassign', queueController.reassignQueueWindow);
router.patch('/move-window', queueController.moveQueueToAnotherWindow);
router.get('/stats', queueController.getQueueStats);
router.get('/raw', queueController.getQueueRawJson);
router.post('/raw', queueController.markQueueRawDownloaded);
router.get('/export', queueController.exportQueueRaw);
router.patch('/:id/full', queueController.updateQueueFull);
router.patch('/:id', queueController.updateQueueWindow);

router.get('/available-times', queueController.getAvailableTimes);
router.get('/questions', queueController.getQuestions);
router.get('/available-dates', queueController.getAvailableDates);
router.get('/last-by-question/:id', queueController.getLastByQuestion);
router.get('/count', queueController.getQueueCount);

module.exports = router;
