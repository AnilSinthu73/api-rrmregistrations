const mysql = require('mysql2/promise');
const dotenv = require('dotenv').config();
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME, // Add database name
  multipleStatements: true
};

// SQL for creating database and tables
const createDatabaseAndTables = `
CREATE DATABASE IF NOT EXISTS drdregistrations;
USE drdregistrations;

CREATE TABLE IF NOT EXISTS scholars (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scholarName VARCHAR(255) NOT NULL,
  scholarImage VARCHAR (255) NOT NULL,
  dateOfBirth DATE NOT NULL,
  branch VARCHAR(255) NOT NULL,
  rollNumber VARCHAR(50) UNIQUE NOT NULL ,
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
  course_type VARCHAR(255),
  course_name VARCHAR(255),
  year INT,
  FOREIGN KEY (scholar_id) REFERENCES scholars(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rrm_details (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scholar_id INT ,
  rrm_date DATE ,
  status TEXT ,
  satisfaction ENUM('Satisfactory', 'Not Satisfactory'),
  file VARCHAR(255),
  FOREIGN KEY (scholar_id) REFERENCES scholars(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS publications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scholar_id INT ,
  title VARCHAR(255),
  authors TEXT ,
  journal_conference VARCHAR(255),
  free_paid ENUM('Free', 'Paid', ''),
  impact_factor DECIMAL(5,2),
  FOREIGN KEY (scholar_id) REFERENCES scholars(id) ON DELETE CASCADE
);
`;

const initializeDatabase = async () => {
  const connection = await mysql.createConnection(dbConfig);
  await connection.query(createDatabaseAndTables);
  console.log('Database and tables created successfully');
  await connection.end();
};

const getConnection = async () => {
  return mysql.createConnection({
    ...dbConfig,
    database: 'drdregistrations'
  });
};

module.exports = { initializeDatabase, getConnection };
