const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

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
  password: 'Anil@73',
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
  course_type ENUM('Audit', 'Credit', 'Pre-PhD') NOT NULL,
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
    const uploadDir = 'uploads/phdapplications';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const upload = multer({ storage: storage });

// Initialize database and start server
async function initializeApp() {
  try {
    // Create connection
    const connection = await mysql.createConnection(dbConfig);

    // Create database and tables
    await connection.query(createDatabaseAndTables);
    console.log('Database and tables created successfully');

    // Close initial connection
    await connection.end();

    // Create a new connection to the specific database
    const db = await mysql.createConnection({
      ...dbConfig,
      database: 'drdregistrations'
    });

    // API endpoint to submit form data
    app.post('/api/submit-form', upload.fields([
      { name: 'progressFile', maxCount: 1 },
      { name: 'rrmApplicationFile', maxCount: 1 }
    ]), async (req, res) => {
      const formData = req.body;
      const files = req.files;

      try {
        // Start transaction
        await db.beginTransaction();

        // Insert scholar details
        const [scholarResult] = await db.query(
          `INSERT INTO scholars (
            scholarName, dateOfBirth, branch, rollNumber, scholarMobile, scholarEmail,
            supervisorName, supervisorMobile, supervisorEmail, coSupervisorName, coSupervisorMobile, coSupervisorEmail,
            titleOfResearch, areaOfResearch, progressFile, rrmApplicationFile
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        // Inside your app.post('/api/submit-form', ...) handler

        // Parse the JSON strings for auditCourse, creditCourse, and prePhDSubjects
        const auditCourse = JSON.parse(formData.auditCourse);
        const creditCourse = JSON.parse(formData.creditCourse);
        const prePhDSubjects = JSON.parse(formData.prePhDSubjects);

        // Prepare course values, filtering out any courses with empty names
        const courseValues = [
          [scholarId, 'Audit', auditCourse.courseName, auditCourse.year],
          [scholarId, 'Credit', creditCourse.courseName, creditCourse.year],
          ...prePhDSubjects.map(subject => [scholarId, 'Pre-PhD', subject.courseName, subject.year])
        ].filter(course => course[2] && course[3]); // Filter out courses with null/undefined name or year

        // Only insert courses if there are valid entries
        if (courseValues.length > 0) {
          await db.query(
            `INSERT INTO courses (scholar_id, course_type, course_name, year) VALUES ?`,
            [courseValues]
          );
        } else {
          console.log('No valid courses to insert');
        }
        // Insert RRM details
        const rrmValues = JSON.parse(formData.rrmDetails).map(rrm => [
          scholarId, rrm.date, rrm.status, rrm.satisfaction
        ]);

        await db.query(
          `INSERT INTO rrm_details (scholar_id, rrm_date, status, satisfaction) VALUES ?`,
          [rrmValues]
        );

        // Insert publications
        const publicationValues = JSON.parse(formData.publications).map(pub => [
          scholarId, pub.title, pub.authors, pub.journalConference, pub.freePaid, pub.impactFactor
        ]);

        await db.query(
          `INSERT INTO publications (
            scholar_id, title, authors, journal_conference, free_paid, impact_factor
          ) VALUES ?`,
          [publicationValues]
        );

        // Commit transaction
        await db.commit();

        res.status(200).json({ message: 'Form submitted successfully' });
      } catch (error) {
        // Rollback transaction in case of error
        await db.rollback();
        console.error('Error inserting data:', error);
        res.status(500).json({ error: 'Error submitting form' });
      }
    });
    // API endpoint to get all submissions
// API endpoint to get all submissions with file URLs
app.get('/api/get-submissions', async (req, res) => {
  try {
    // Base URL for file links (adjust as per your production environment)
    const fileBaseUrl = `http://localhost:${port}/phdapplications/`;

    // Query to get all scholar submissions with related data (courses, rrm details, publications)
    const [submissions] = await db.query(`
      SELECT 
        s.id AS scholarId, s.scholarName, s.dateOfBirth, s.branch, s.rollNumber, 
        s.scholarMobile, s.scholarEmail, s.supervisorName, s.supervisorMobile, s.supervisorEmail, 
        s.coSupervisorName, s.coSupervisorMobile, s.coSupervisorEmail, s.titleOfResearch, s.areaOfResearch, 
        CONCAT('${fileBaseUrl}', s.progressFile) AS progressFile,
        CONCAT('${fileBaseUrl}', s.rrmApplicationFile) AS rrmApplicationFile,
        s.created_at,
        JSON_ARRAYAGG(JSON_OBJECT(
          'courseType', c.course_type, 
          'courseName', c.course_name, 
          'year', c.year
        )) AS courses,
        JSON_ARRAYAGG(JSON_OBJECT(
          'rrmDate', r.rrm_date, 
          'status', r.status, 
          'satisfaction', r.satisfaction
        )) AS rrmDetails,
        JSON_ARRAYAGG(JSON_OBJECT(
          'publicationTitle', p.title, 
          'authors', p.authors, 
          'journalConference', p.journal_conference, 
          'freePaid', p.free_paid, 
          'impactFactor', p.impact_factor
        )) AS publications
      FROM scholars s
      LEFT JOIN courses c ON s.id = c.scholar_id
      LEFT JOIN rrm_details r ON s.id = r.scholar_id
      LEFT JOIN publications p ON s.id = p.scholar_id
      GROUP BY s.id
    `);

    // Send the submissions data as a JSON response
    res.status(200).json(submissions);
  } catch (error) {
    console.error('Error retrieving submissions:', error);
    res.status(500).json({ error: 'Error retrieving submissions' });
  }
});
app.get('/phdapplications/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, 'uploads', 'phdapplications', filename);

  // Check if the file exists
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Send the file if it exists
    res.sendFile(filePath);
  });
});



    // Start the server
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });

  } catch (error) {
    console.error('Error initializing app:', error);
  }
}

// Run the application
initializeApp();