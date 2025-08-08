const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController.cjs');

router.post('/login', authController.login);
router.post('/login/employee', authController.loginEmployee);

module.exports = router;
