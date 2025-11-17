const express = require('express');
const router = express.Router();
const settingsService = require('../services/settingsService');
const settingsController = require('../controllers/settingsController');
const { getOptions } = require('../services/optionsService');

router.get('/options', (req, res) => {
  const opts = getOptions();
  res.json(opts);
});

router.get('/alarm', settingsController.getAlarmStatus);
router.patch('/alarm', settingsController.setAlarmStatus);

router.get('/lunch', settingsController.getLunchSettings);
router.patch('/lunch', settingsController.setLunchSettings);

router.get('/:key', (req, res) => {
  settingsService.getSetting(req.params.key, (err, value) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ value });
  });
});

router.post('/', (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'Key required' });

  settingsService.setSetting(key, value, (err) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success: true });
  });
});



module.exports = router;
