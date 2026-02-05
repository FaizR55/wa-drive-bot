const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./database.db", (err) => {
  if (err) console.error("Error opening database:", err);
  else {
    db.run(
      `CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender TEXT,
        message TEXT,
        image_url TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS user (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    );

    // Insert dummy data only if it doesn't exist
    db.run(
      `INSERT OR IGNORE INTO user (username, email, password, active, created_at, updated_at) 
       VALUES ('admin', 'admin@mail.com', 'pass123', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    );
  }
});

module.exports = db;
