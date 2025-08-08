const express = require('express');
const router = express.Router();
const questionsController = require('../controllers/questionsController');

router.get('/', questionsController.getAllQuestions);
router.post('/', questionsController.createQuestion);
router.delete('/:id', questionsController.deleteQuestion);

module.exports = router;
