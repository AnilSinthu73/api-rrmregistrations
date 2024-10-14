const express = require('express');
const { initializeDatabase } = require('./config/db');
const formRoutes = require('./routes/formRoutes');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT;

// Initialize database and create tables
initializeDatabase();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration
const allowedOrigins = [
  'http://localhost:3011',
  'https://rrmregisteration.jntugv.edu.in'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Check if the origin is in the allowed origins list
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true); // Allow the request
    } else {
      callback(new Error('Not allowed by CORS')); // Deny the request
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'], // Specify allowed methods
  //credentials: true, // If you want to allow cookies to be sent
};

// Use CORS middleware with options
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions)); // Enable pre-flight across-the-board

app.get('/', (req, res) => {
  res.send('Welcome to the PhD Scholar Registration System');
});

app.use('/api', formRoutes);

// Serve static files from 'uploads' folder
app.use('/uploads', express.static('uploads'));

app.listen(PORT, () => {
  console.log(`Server is running on ${PORT}`);
});
