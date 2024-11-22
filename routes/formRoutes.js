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
  { name: 'scholarImage', maxCount: 1 },
  { name: 'progressFile', maxCount: 1 },
  { name: 'rrmApplicationFile', maxCount: 1 },
  { name: 'rrmDetailsFile', maxCount: 10 } // Ensure up to 10 RRM files
]), async (req, res) => {
  let db;
  try {
    db = await getConnection();
    await db.beginTransaction();
    const formData = req.body;
    const files = req.files;
    console.log(formData);
    console.log(files);
    // Check if the scholar already exists to avoid multiple submissions
    const [existingScholar] = await db.query(`SELECT * FROM scholars WHERE rollNumber = ?`, [formData.rollNumber]);
    if (existingScholar.length > 0) {
      return res.status(409).json({ error: 'Scholar already exists' });
    }
    // Insert Scholar Details
    const [scholarResult] = await db.query(
      `
        INSERT INTO scholars (
          scholarName, scholarImage, dateOfBirth, branch, rollNumber, scholarMobile, scholarEmail,
          supervisorName, supervisorMobile, supervisorEmail, coSupervisorName, coSupervisorMobile, coSupervisorEmail,
          titleOfResearch, areaOfResearch, progressFile, rrmApplicationFile
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        formData.scholarName,
        files['scholarImage'] ? files['scholarImage'][0].filename : '',
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
        files['progressFile'] ? files['progressFile'][0].filename : '',
        files['rrmApplicationFile'] ? files['rrmApplicationFile'][0].filename : ''
      ]
    );


    const scholarId = scholarResult.insertId;

    // Handling Courses
    const auditCourses = ensureArray(JSON.parse(formData.auditCourse || '[]'));
    const creditCourses = ensureArray(JSON.parse(formData.creditCourse || '[]'));
    const prePhDSubjects = ensureArray(JSON.parse(formData.prePhDSubjects || '[]'));

    const courseValues = [
      ...auditCourses.filter(course => course.courseName && course.year).map(course => [scholarId, 'Audit', course.courseName, course.year]),
      ...creditCourses.filter(course => course.courseName && course.year).map(course => [scholarId, 'Credit', course.courseName, course.year]),
      ...prePhDSubjects.filter(course => course.courseName && course.year).map((course, index) => [scholarId, `PrePhD ${index + 1}`, course.courseName, course.year]),
    ];
    if (courseValues.length > 0) {
      await db.query(`INSERT INTO courses (scholar_id, course_type, course_name, year) VALUES ?`, [courseValues]);
    }
    // Handling RRM Details and Files
    let rrmDetailsArray = ensureArray(formData.rrmDetails);

    const rrmDetails = rrmDetailsArray
      .filter(rrm => rrm.date && rrm.status && rrm.satisfaction)
      .map((rrm, index) => {
        const rrmDetail = [
          scholarId,
          rrm.date,
          rrm.status,
          rrm.satisfaction
        ];
        if (files['rrmDetailsFile'] && files['rrmDetailsFile'][index]) {
          rrmDetail.push(files['rrmDetailsFile'][index].filename);
        }
        return rrmDetail;
      });
    if (rrmDetails.length > 0) {
      const columns = ['scholar_id', 'rrm_date', 'status', 'satisfaction', 'file'];
      await db.query(`INSERT INTO rrm_details (${columns.join(', ')}) VALUES ?`, [rrmDetails]);
    }

    // Handling Publications
    const publications = ensureArray(JSON.parse(formData.publications || '[]'))
      .filter(pub => pub.title && pub.authors && pub.journalConference && pub.freePaid)
      .map(pub => {
        const publication = [
          scholarId,
          pub.title,
          pub.authors,
          pub.journalConference,
          pub.freePaid
        ];
        if (pub.impactFactor) {
          publication.push(pub.impactFactor);
        }
        return publication;
      });

    if (publications.length > 0) {
      const columns = ['scholar_id', 'title', 'authors', 'journal_conference', 'free_paid', 'impact_factor'];
      await db.query(`INSERT INTO publications (${columns.join(', ')}) VALUES ?`, [publications]);
    }

    await db.commit();
    res.status(200).json({ message: 'Form submitted successfully' });
  } catch (error) {
    console.error('Error submitting form:', error);
    if (db) await db.rollback(); // Rollback only if db is defined
    res.status(500).json({ error: 'Error submitting form' });
  } finally {
    if (db) await db.end(); // Close the connection
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
    CASE 
        WHEN s.scholarImage IS NOT NULL THEN CONCAT('${DOMAIN}', s.scholarImage) 
        ELSE '' 
    END AS scholarImage,
    DATE_FORMAT(s.dateOfBirth, '%d/%m/%Y') AS dateOfBirth,
    s.branch, 
    s.rollNumber, 
    s.scholarMobile, 
    s.scholarEmail, 
    s.supervisorName, 
    IFNULL(s.supervisorMobile, '') AS supervisorMobile, 
    IFNULL(s.supervisorEmail, '') AS supervisorEmail, 
    IFNULL(s.coSupervisorName, '') AS coSupervisorName, 
    IFNULL(s.coSupervisorMobile, '') AS coSupervisorMobile, 
    IFNULL(s.coSupervisorEmail, '') AS coSupervisorEmail, 
    IFNULL(s.titleOfResearch, '') AS titleOfResearch, 
    IFNULL(s.areaOfResearch, '') AS areaOfResearch,  
    CASE 
        WHEN s.progressFile IS NOT NULL THEN CONCAT('${DOMAIN}', s.progressFile) 
        ELSE '' 
    END AS progressFile,
    CASE 
        WHEN s.rrmApplicationFile IS NOT NULL THEN CONCAT('${DOMAIN}', s.rrmApplicationFile) 
        ELSE '' 
    END AS rrmApplicationFile,
    DATE_FORMAT(s.created_at, '%d/%m/%Y') AS createdAt,
    (SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'course_type', IFNULL(c.course_type, ''), 
        'course_name', IFNULL(c.course_name, ''), 
        'year', IFNULL(c.year, '')
    )) 
     FROM courses c 
     WHERE c.scholar_id = s.id) AS courses,
    (SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'rrm_date', IFNULL(DATE_FORMAT(r.rrm_date, '%d/%m/%Y'), ''), 
        'status', IFNULL(r.status, ''), 
        'satisfaction', IFNULL(r.satisfaction, ''), 
        'file', CASE 
                   WHEN r.file IS NOT NULL THEN CONCAT('${DOMAIN}', r.file) 
                   ELSE '' 
                END
    )) 
     FROM rrm_details r 
     WHERE r.scholar_id = s.id) AS rrmDetails,
    (SELECT JSON_ARRAYAGG(JSON_OBJECT(
        'title', IFNULL(p.title, ''), 
        'authors', IFNULL(p.authors, ''), 
        'journal_conference', IFNULL(p.journal_conference, ''), 
        'free_paid', IFNULL(p.free_paid, ''), 
        'impact_factor', IFNULL(p.impact_factor, '')
    )) 
     FROM publications p 
     WHERE p.scholar_id = s.id) AS publications
FROM scholars s `);
    res.status(200).json(submissions);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ error: 'Error fetching submissions' });
  }
});

module.exports = router;