const sqlite3 = require("sqlite3").verbose();

let db;
let initPromise;

// Create a promise that resolves when database initialization is complete
initPromise = new Promise((resolve, reject) => {
  console.log("Initiating Database connection...");
  
  db = new sqlite3.Database("./database.db", (err) => {
    if (err) {
      console.error("Error opening database:", err);
      reject(err);
    } else {
      console.log("Database connected successfully");
      
      // Create messages table
      db.run(
        `CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sender TEXT,
          message TEXT,
          image_url TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        (err) => {
          if (err) {
            console.error("Error creating messages table:", err);
            reject(err);
          } else {
            console.log("Messages table created/verified successfully");
            
            // Create user table
            db.run(
              `CREATE TABLE IF NOT EXISTS user (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
              )`,
              (err) => {
                if (err) {
                  console.error("Error creating user table:", err);
                  reject(err);
                } else {
                  console.log("User table created/verified successfully");
                  
                  // Insert dummy data only after user table is created
                  db.run(
                    `INSERT OR IGNORE INTO user (username, email, password, active, created_at, updated_at) 
                     VALUES ('admin', 'admin@mail.com', 'pass123', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                    (err) => {
                      if (err) {
                        console.error("Error inserting dummy data:", err);
                        reject(err);
                      } else {
                        console.log("Dummy user data inserted/verified successfully");
                        resolve(db); // Resolve with the database instance
                      }
                    }
                  );
                }
              }
            );
          }
        }
      );
    }
  });
});

module.exports = {
  db: () => db,
  init: initPromise
};
