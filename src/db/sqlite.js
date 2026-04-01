const sqlite3 = require("sqlite3").verbose();

let db;
let initPromise;

function runQuery(sql, successMessage, errorMessage) {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => {
      if (err) {
        if (errorMessage) {
          console.error(errorMessage, err);
        }

        reject(err);
        return;
      }

      if (successMessage) {
        console.log(successMessage);
      }

      resolve();
    });
  });
}

// Create a promise that resolves when database initialization is complete
initPromise = new Promise((resolve, reject) => {
  console.log("Initiating Database connection...");

  db = new sqlite3.Database("./database.db", (err) => {
    if (err) {
      console.error("Error opening database:", err);
      reject(err);
    } else {
      console.log("Database connected successfully");

      runQuery(
        `CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sender TEXT,
          message TEXT,
          image_url TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        "Messages table created/verified successfully",
        "Error creating messages table:"
      )
        .then(() =>
          runQuery(
            `CREATE TABLE IF NOT EXISTS user (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
              )`,
            "User table created/verified successfully",
            "Error creating user table:"
          )
        )
        .then(() =>
          runQuery(
            `INSERT OR IGNORE INTO user (username, email, password, active, created_at, updated_at) 
             VALUES ('admin', 'admin@mail.com', 'pass123', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            "Dummy user data inserted/verified successfully",
            "Error inserting dummy data:"
          )
        )
        .then(() =>
          runQuery(
            `CREATE TABLE IF NOT EXISTS master_data (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              key TEXT NOT NULL,
              value TEXT NOT NULL,
              detail TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            "Master data table created/verified successfully",
            "Error creating master_data table:"
          )
        )
        .then(() => {
          resolve(db);
        })
        .catch(reject);
    }
  });
});

module.exports = {
  db: () => db,
  init: initPromise
};
