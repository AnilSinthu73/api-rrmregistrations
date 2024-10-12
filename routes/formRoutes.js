const express = require('express');
const { getConnection } = require('../config/db');
const { upload } = require('../middlewares/fileUploads');
const path = require('path');
const fs = require('fs');
const router = express.Router();
require('dotenv').config();

// Helper function to ensure value is array
const ensureArray = (data) => Array.isArray(data) ? data : [data];

// Submit form data
router.post('/submit-form', upload.fields([
  { name: 'progressFile', maxCount: 1 },
  { name: 'rrmApplicationFile', maxCount: 1 },
  { name: 'rrmDetailsFile', maxCount: 10 } // Ensure up to 10 RRM files
]), async (req, res) => {
  try {
    const db = await getConnection();
    await db.beginTransaction();
    const formData = req.body;
    const files = req.files;
    console.log(formData);
    console.log(files);

    // Insert Scholar Details
    const [scholarResult] = await db.query(`
      INSERT INTO scholars (
        scholarName, dateOfBirth, branch, rollNumber, scholarMobile, scholarEmail,
        supervisorName, supervisorMobile, supervisorEmail, coSupervisorName, coSupervisorMobile, coSupervisorEmail,
        titleOfResearch, areaOfResearch, progressFile, rrmApplicationFile
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `, [
      formData.scholarName, formData.dateOfBirth, formData.branch, formData.rollNumber, formData.scholarMobile,
      formData.scholarEmail, formData.supervisorName, formData.supervisorMobile, formData.supervisorEmail,
      formData.coSupervisorName, formData.coSupervisorMobile, formData.coSupervisorEmail, formData.titleOfResearch,
      formData.areaOfResearch, files['progressFile'][0].filename, files['rrmApplicationFile'][0].filename
    ]);

    const scholarId = scholarResult.insertId;

    // Handling Courses
    const auditCourses = ensureArray(JSON.parse(formData.auditCourse || '[]'));
    const creditCourses = ensureArray(JSON.parse(formData.creditCourse || '[]'));
    const prePhDSubjects = ensureArray(JSON.parse(formData.prePhDSubjects || '[]'));

    const courseValues = [
      ...auditCourses.map(course => [scholarId, 'Audit', course.courseName, course.year]),
      ...creditCourses.map(course => [scholarId, 'Credit', course.courseName, course.year]),
      ...prePhDSubjects.map((course, index) => [scholarId, `PrePhD ${index + 1}`, course.courseName, course.year])
    ];

    if (courseValues.length > 0) {
      await db.query(`INSERT INTO courses (scholar_id, course_type, course_name, year) VALUES ?`, [courseValues]);
    }

    // Handling RRM Details and Files
    console.log(formData.rrmDetails);
    let rrmDetailsArray = [];

    if (Array.isArray(formData.rrmDetails)) {
      rrmDetailsArray = formData.rrmDetails;
    } else if (typeof formData.rrmDetails === 'string') {
      try {
        rrmDetailsArray = ensureArray(JSON.parse(formData.rrmDetails));
      } catch (error) {
        console.error('Error parsing rrmDetails:', error);
      }
    } else {
      console.warn('formData.rrmDetails is not a valid array or string:', formData.rrmDetails);
    }

    const rrmDetails = rrmDetailsArray.map((rrm, index) => [
      scholarId,
      rrm.date || null,
      rrm.status || null,
      rrm.satisfaction || null,
      files['rrmDetailsFile'] && files['rrmDetailsFile'][index] ? files['rrmDetailsFile'][index].filename : null // Mapping files correctly
    ]);

    console.log('Received rrmDetails:', rrmDetailsArray);
    console.log('Mapped RRM Details:', rrmDetails);

    if (rrmDetails.length > 0) {
      await db.query(`INSERT INTO rrm_details (scholar_id, rrm_date, status, satisfaction, file) VALUES ?`, [rrmDetails]);
    }

    // Handling Publications
    const publications = ensureArray(JSON.parse(formData.publications || '[]')).map(pub => [
      scholarId,
      pub.title,
      pub.authors,
      pub.journalConference,
      pub.freePaid,
      pub.impactFactor
    ]);

    if (publications.length > 0) {
      await db.query(`INSERT INTO publications (scholar_id, title, authors, journal_conference, free_paid, impact_factor) VALUES ?`, [publications]);
    }
    
    await db.commit();
    res.status(200).json({ message: 'Form submitted successfully' });
  } catch (error) {
    console.error('Error submitting form:', error);
    await db.rollback(); // Rollback in case of error
    res.status(500).json({ error: 'Error submitting form' });
  }
});

// Serve files from the 'uploads/phdapplications' directory
router.get('/phdapplications/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, '..', 'uploads', 'phdapplications', filename);

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.sendFile(filePath);
  });
});

// API Route for fetching submissions
router.get('/get-submissions', async (req, res) => {
  try {
    
    const DOMAIN = `${process.env.apiIP}/api/phdapplications/`;
    const db = await getConnection();
    const [submissions] = await db.query(`
      SELECT 
        s.id AS scholarId, 
        s.scholarName, 
        DATE_FORMAT(s.dateOfBirth, '%d/%m/%Y') AS dateOfBirth, 
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
        CONCAT('${DOMAIN}', s.progressFile) AS progressFile, 
        CONCAT('${DOMAIN}', s.rrmApplicationFile) AS rrmApplicationFile, 
        DATE_FORMAT(s.created_at, '%d/%m/%Y') AS created_at,
        (SELECT JSON_ARRAYAGG(JSON_OBJECT('course_type', c.course_type, 'course_name', c.course_name, 'year', c.year)) 
          FROM courses c WHERE c.scholar_id = s.id) AS courses,
        (SELECT JSON_ARRAYAGG(JSON_OBJECT('rrm_date', DATE_FORMAT(r.rrm_date, '%d/%m/%Y'), 'status', r.status, 'satisfaction', r.satisfaction, 'file', CONCAT('${DOMAIN}', r.file)) 
          ) FROM rrm_details r WHERE r.scholar_id = s.id) AS rrmDetails,
        (SELECT JSON_ARRAYAGG(JSON_OBJECT('title', p.title, 'authors', p.authors, 'journal_conference', p.journal_conference, 'free_paid', p.free_paid, 'impact_factor', p.impact_factor)) 
          FROM publications p WHERE p.scholar_id = s.id) AS publications
      FROM scholars s;
    `);

    res.status(200).json(submissions);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ error: 'Error fetching submissions' });
  }
});

module.exports = router;
