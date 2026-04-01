require("dotenv").config();
const express = require("express");
const { createBot } = require("./config/wwjsConfig");
const handleMessage = require("./controllers/messageController");
const { router, setGlobals } = require("./routes");
const { masterDataRouter, setDatabase } = require("./services/masterData");
const dbModule = require("./db/sqlite");

const app = express();
const PORT = process.env.PORT || 3000;
const enableWhatsApp = process.env.ENABLE_WHATSAPP !== "false";

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// CORS middleware (allow all origins for simplicity)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  next();
});

// Error handling value parsing errors
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      success: false,
      error: "Invalid JSON payload",
      message: "Send 'value' as an array, or if sending it as a string, escape inner quotes properly.",
      example: {
        key: "test",
        value: [
          { id: 10, value: "Issue" },
          { id: 11, value: "Information" }
        ],
        detail: "test"
      },
      timestamp: new Date().toISOString()
    });
  }

  next(err);
});

// Global client variable to store the WhatsApp client
let globalClient = null;
let clientStatus = {
  isReady: false,
  isAuthenticated: false,
  isConnected: false,
  lastUpdate: null,
  wwebVersion: null,
  error: null
};

const startBot = async () => {
  const client = await createBot();

  if (client) {
    globalClient = client;
    setGlobals(client, clientStatus);

    // Update status on various events
    client.on('authenticated', () => {
      clientStatus.isAuthenticated = true;
      clientStatus.lastUpdate = new Date().toISOString();
      console.log('Status updated: AUTHENTICATED');
    });

    client.on('ready', async () => {
      clientStatus.isReady = true;
      clientStatus.isConnected = true;
      clientStatus.lastUpdate = new Date().toISOString();
      try {
        clientStatus.wwebVersion = await client.getWWebVersion();
      } catch (err) {
        console.error('Error getting WWeb version:', err);
      }
      console.log("✅ wa-drive is ready!");
    });

    client.on('disconnected', (reason) => {
      clientStatus.isConnected = false;
      clientStatus.isReady = false;
      clientStatus.lastUpdate = new Date().toISOString();
      clientStatus.error = reason;
      console.log('Status updated: DISCONNECTED');
    });

    client.on('auth_failure', (msg) => {
      clientStatus.isAuthenticated = false;
      clientStatus.error = msg;
      clientStatus.lastUpdate = new Date().toISOString();
      console.log('Status updated: AUTH_FAILURE');
    });

    // New message handler
    client.on("message", async (message) => {
      try {
        await handleMessage(client, message);
      } catch (error) {
        console.error("Error handling message:", error);
      }
    });
  }
};

console.log(
  enableWhatsApp
    ? "wa-drive server starting... WhatsApp bot is enabled."
    : "wa-drive server starting... WhatsApp bot is disabled by ENABLE_WHATSAPP=false."
);

// Initialize database and start server
dbModule.init
  .then((database) => {
    // Set database for masterData service
    setDatabase(database);
    console.log("Database initialized successfully");

    // Register routes with /api prefix
    app.use("/api", router);
    app.use("/api/op", masterDataRouter);

    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

    if (enableWhatsApp) {
      startBot();
    }
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });
