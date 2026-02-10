require("dotenv").config();
const express = require("express");
const { authenticateToken, login } = require("./services/auth");
const waController = require("./controllers/waController");
const { createBot } = require("./config/wwjsConfig");
const handleMessage = require("./controllers/messageController");
const globalState = require("./config/globalState");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const startBot = async () => {
  const client = await createBot();

  // Message gateway
  if (client) {
    globalState.setClient(client);
    client.on("message", async (message) => {
      try {
        await handleMessage(client, message);
      } catch (error) {
        console.error("Error handling message:", error);
      }
    });
  }
};

// Public endpoints
app.get("/", (req, res) => res.send("wa-drive is running 🚀"));
app.post("/api/login", login);

// Protected endpoints
app.get("/api/wa/stat", authenticateToken, waController.getStatus);
app.post("/api/wa/logout", authenticateToken, waController.logout);
app.post("/api/wa/login", authenticateToken, (req, res) => waController.login(req, res, startBot));
app.post("/api/wa/reinitialize", authenticateToken, waController.reinitialize);

// Initialize database first, then start server
const dbModule = require("./db/sqlite");
dbModule.init.then(() => {
  console.log("");
  // Don't start bot automatically - it will be started when /wa/login is called
  console.log("wa-drive server starting... WhatsApp bot will be initialized on first login request.");
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}).catch((error) => {
  console.error("Failed to initialize database:", error);
  process.exit(1);
});
