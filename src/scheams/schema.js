const mysql = require('mysql2');

async function createDatabaseAndTables() {
  const db = await mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: 'Anil@73',
    database: 'drdregistrations',
  });

  await db.execute('CREATE DATABASE IF NOT EXISTS drdregistrations');
  await db.execute('USE drdregistrations');

  // Create scholars table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS scholars (
      id INT AUTO_INCREMENT PRIMARY KEY,
      scholar_name VARCHAR(255) NOT NULL,
      date_of_birth DATE NOT NULL,
      branch VARCHAR(255) NOT NULL,
      roll_number VARCHAR(50) NOT NULL,
      scholar_mobile VARCHAR(15) NOT NULL,
      scholar_email VARCHAR(255) NOT NULL,
      supervisor_mobile VARCHAR(15) NOT NULL,
      supervisor_email VARCHAR(255) NOT NULL,
      co_supervisor_mobile VARCHAR(15),
      co_supervisor_email VARCHAR(255),
      title_of_research TEXT NOT NULL,
      area_of_research VARCHAR(255) NOT NULL,
      progress_file VARCHAR(255) NOT NULL,
      rrm_application_file VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create courses table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS courses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      scholar_id INT NOT NULL,
      course_type ENUM('Audit', 'Credit', 'Pre-PhD') NOT NULL,
      course_name VARCHAR(255) NOT NULL,
      year INT NOT NULL,
      FOREIGN KEY (scholar_id) REFERENCES scholars(id) ON DELETE CASCADE
    );
  `);

  // Create rrm_details table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS rrm_details (
      id INT AUTO_INCREMENT PRIMARY KEY,
      scholar_id INT NOT NULL,
      rrm_date DATE NOT NULL,
      status TEXT NOT NULL,
      satisfaction ENUM('Satisfactory', 'Not Satisfactory') NOT NULL,
      FOREIGN KEY (scholar_id) REFERENCES scholars(id) ON DELETE CASCADE
    );
  `);

  // Create publications table
  await db.execute(`
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
  `);

  console.log('Database and tables created successfully.');
}

createDatabaseAndTables().catch(console.error);