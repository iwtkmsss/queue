const express = require('express');
const cors = require('cors');
const app = express();
const db = require('./database');

app.use(cors());
app.use(express.json());

app.set('db', db);

module.exports = app;
