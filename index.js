const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv').config();
const app = express();
const port = 9999;

app.use(cors());
app.use(express.json());

// Serve the 'uploads' folder statically at the '/uploads' path
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MySQL connection configuration
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: process.env.dbPassword,
  multipleStatements: true
};

// SQL for creating database and tables
const createDatabaseAndTables = `
CREATE DATABASE IF NOT EXISTS drdregistrations;
USE drdregistrations;

CREATE TABLE IF NOT EXISTS scholars (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scholarName VARCHAR(255) NOT NULL,
  dateOfBirth DATE NOT NULL,
  branch VARCHAR(255) NOT NULL,
  rollNumber VARCHAR(50) NOT NULL,
  scholarMobile VARCHAR(15) NOT NULL,
  scholarEmail VARCHAR(255) NOT NULL,
  supervisorName VARCHAR(255) NOT NULL,
  supervisorMobile VARCHAR(15) NOT NULL,
  supervisorEmail VARCHAR(255) NOT NULL,
  coSupervisorName VARCHAR(255),
  coSupervisorMobile VARCHAR(15),
  coSupervisorEmail VARCHAR(255),
  titleOfResearch TEXT NOT NULL,
  areaOfResearch VARCHAR(255) NOT NULL,
  progressFile VARCHAR(255) NOT NULL,
  rrmApplicationFile VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS courses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scholar_id INT NOT NULL,
  course_type VARCHAR(255) NOT NULL,
  course_name VARCHAR(255) NOT NULL,
  year INT NOT NULL,
  FOREIGN KEY (scholar_id) REFERENCES scholars(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rrm_details (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scholar_id INT NOT NULL,
  rrm_date DATE NOT NULL,
  status TEXT NOT NULL,
  satisfaction ENUM('Satisfactory', 'Not Satisfactory') NOT NULL,
  file VARCHAR(255),
  FOREIGN KEY (scholar_id) REFERENCES scholars(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS publications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scholar_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  authors TEXT NOT NULL,
  journal_conference VARCHAR(255) NOT NULL,
  free_paid ENUM('Free', 'Paid') NOT NULL,
  impact_factor DECIMAL(5,2) NOT NULL,
  FOREIGN KEY (scholar_id) REFERENCES scholars(id) ON DELETE CASCADE
);
`;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads', 'phdapplications');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir); // Save in the correct directory
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname.replace(/\s+/g, '_'); // Unique file name
    cb(null, uniqueName); // Save file with the unique name
  }
});

const upload = multer({ storage: storage });

// Initialize database and start server
async function initializeApp() {
  try {
    const connection = await mysql.createConnection(dbConfig);
    await connection.query(createDatabaseAndTables);
    console.log('Database and tables created successfully');
    await connection.end();

    const db = await mysql.createConnection({
      ...dbConfig,
      database: 'drdregistrations'
    });

    // API to submit form data
    app.post('/api/submit-form', upload.fields([
      { name: 'progressFile', maxCount: 1 },
      { name: 'rrmApplicationFile', maxCount: 1 },
      { name: 'rrmDetailsFile', maxCount: 10 } // Handle up to 10 files for RRM details
    ]), async (req, res) => {
      console.log("Received form data:", req.body); // Debugging received data
      console.log("Received files:", req.files); // Debugging received files

      const formData = req.body;
      const files = req.files;

      try {
        await db.beginTransaction();

        // Insert scholar details
        const [scholarResult] = await db.query(
          `INSERT INTO scholars (
            scholarName, dateOfBirth, branch, rollNumber, scholarMobile, scholarEmail,
            supervisorName, supervisorMobile, supervisorEmail, coSupervisorName, coSupervisorMobile, coSupervisorEmail,
            titleOfResearch, areaOfResearch, progressFile, rrmApplicationFile
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            formData.scholarName,
            formData.dateOfBirth,
            formData.branch,
            formData.rollNumber,
            formData.scholarMobile,
            formData.scholarEmail,
            formData.supervisorName,
            formData.supervisorMobile,
            formData.supervisorEmail,
            formData.coSupervisorName,
            formData.coSupervisorMobile,
            formData.coSupervisorEmail,
            formData.titleOfResearch,
            formData.areaOfResearch,
            files['progressFile'][0].filename,
            files['rrmApplicationFile'][0].filename
          ]
        );

        const scholarId = scholarResult.insertId;

        // Insert courses
        const courseValues = [
          ...JSON.parse(formData.auditCourse || '[]').map(course => [scholarId, 'Audit', course.courseName, course.year]),
          ...JSON.parse(formData.creditCourse || '[]').map(course => [scholarId, 'Credit', course.courseName, course.year]),
          ...JSON.parse(formData.prePhDSubjects || '[]').map(course => [scholarId, 'Pre-PhD', course.courseName, course.year])
        ];

        if (courseValues.length > 0) {
          await db.query(`INSERT INTO courses (scholar_id, course_type, course_name, year) VALUES ?`, [courseValues]);
        }

        // Insert RRM details
        const rrmDetailsArray = JSON.parse(formData.rrmDetails || '[]'); // Parse the RRM details JSON

        const rrmDetails = rrmDetailsArray.map((rrm, index) => {
          // Find the uploaded file for the current RRM detail
          const file = files['rrmDetailsFile'] && files['rrmDetailsFile'][index]
            ? files['rrmDetailsFile'][index].filename // Get the filename if the file exists
            : null;
          console.log(file);
          return [
            scholarId,            // ID of the scholar
            rrm.date,             // Date of RRM (from formData)
            rrm.status,           // Status of RRM (from formData)
            rrm.satisfaction,     // Satisfaction level (from formData)
            file                  // Uploaded file or null if not provided
          ];
        });

        // Check if there are any RRM details to insert
        if (rrmDetails.length > 0) {
          try {
            // Insert the RRM details into the database
            await db.query(
              `INSERT INTO rrm_details (scholar_id, rrm_date, status, satisfaction, file) VALUES ?`,
              [rrmDetails] // Insert the array of RRM details
            );
            console.log('RRM details inserted successfully.');
          } catch (error) {
            console.error('Error inserting RRM details:', error);
            throw error; // Roll back the transaction if there's an error
          }
        }

        // Insert publications
        const publications = JSON.parse(formData.publications || '[]').map(pub => [
          scholarId, pub.title, pub.authors, pub.journalConference, pub.freePaid, pub.impactFactor
        ]);

        if (publications.length > 0) {
          await db.query(
            `INSERT INTO publications (
              scholar_id, title, authors, journal_conference, free_paid, impact_factor
            ) VALUES ?`,
            [publications]
          );
        }

        await db.commit(); // Commit transaction
        res.status(200).json({ message: 'Form submitted successfully' });
      } catch (error) {
        await db.rollback(); // Rollback transaction in case of error
        console.error('Error inserting data:', error);
        res.status(500).json({ error: 'Error submitting form' });
      }
    });

    // API to retrieve submissions
    app.get('/api/get-submissions', async (req, res) => {
      try {
        console.log(process.env.apiIP);
        const fileBaseUrl = `${process.env.apiIP}/phdapplications/`; // Base URL for file links

        const [submissions] = await db.query(`
          SELECT 
            s.id AS scholarId, 
            s.scholarName, 
            s.dateOfBirth, 
            s.branch, 
            s.rollNumber, 
            s.scholarMobile, 
            s.scholarEmail, 
            s.supervisorName, 
            s.supervisorMobile, 
            s.supervisorEmail, 
            s.coSupervisorName, 
            s.coSupervisorMobile, 
            s.coSupervisorEmail, 
            s.titleOfResearch, 
            s.areaOfResearch, 
            CONCAT('${fileBaseUrl}', s.progressFile) AS progressFile, 
            CONCAT('${fileBaseUrl}', s.rrmApplicationFile) AS rrmApplicationFile, 
            s.created_at AS submissionDate,
            
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
              'course_type', c.course_type,
              'course_name', c.course_name,
              'year', c.year
            )) FROM courses c WHERE c.scholar_id = s.id) AS courses,
            
            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
              'rrm_date', r.rrm_date,
              'status', r.status,
              'satisfaction', r.satisfaction,
              'file', CONCAT('${fileBaseUrl}', r.file)
            )) FROM rrm_details r WHERE r.scholar_id = s.id) AS rrmDetails,

            (SELECT JSON_ARRAYAGG(JSON_OBJECT(
              'title', p.title,
              'authors', p.authors,
              'journal_conference', p.journal_conference,
              'free_paid', p.free_paid,
              'impact_factor', p.impact_factor
            )) FROM publications p WHERE p.scholar_id = s.id) AS publications

          FROM scholars s;
        `);

        res.json(submissions);
      } catch (error) {
        console.error('Error fetching submissions:', error);
        res.status(500).json({ error: 'Error fetching submissions' });
      }
    });

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error('Error initializing the app:', error);
  }
}

initializeApp();