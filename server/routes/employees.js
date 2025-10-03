const express = require('express');
const router = express.Router();
const employeesController = require('../controllers/employeesController');

router.get('/', employeesController.getAllEmployees);

router.post('/', employeesController.addEmployee);

router.post('/update-status', employeesController.updateStatus);

router.patch('/:id', employeesController.updateEmployee);

router.delete('/:id', employeesController.deleteEmployee);

module.exports = router;
