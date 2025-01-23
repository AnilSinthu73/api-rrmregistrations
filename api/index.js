const express = require('express');
const { initializeDatabase } = require('../config/db');
const formRoutes = require('../routes/formRoutes');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Initialize database and create tables
initializeDatabase();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration
const allowedOrigins = [
  'http://localhost:3011',
  'http://localhost:3000',
  'https://register.jntugv.edu.in',
  'https://rrmregistration.jntugv.edu.in',
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Allow requests with no origin
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true); // Allow the request
    } else {
      callback(new Error('Not allowed by CORS')); // Deny the request
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'], // Specify allowed methods
};

// Use CORS middleware with options
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle preflight requests

// Define routes
app.get('/', (req, res) => {
  res.send('Welcome to the PhD Scholar Registration System');
});

app.use('/api', formRoutes);

// Serve static files from 'uploads' folder
app.use('/uploads', express.static('uploads'));

// Export the app for Vercel
module.exports = app;
