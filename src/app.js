require("dotenv").config();
const express = require("express");
const { createBot, handleWhatsAppLogin, handleWhatsAppLogout, handleWhatsAppReinitialize, getLatestClient, generateQRHTML } = require("./config/wwjsConfig");
const handleMessage = require("./controllers/messageController");
const { authenticateToken, login } = require("./services/auth");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

    client.on("message", async (message) => {
      try {
        await handleMessage(client, message);
      } catch (error) {
        console.error("Error handling message:", error);
      }
    });
  }
};

// Don't start bot automatically - it will be started when /wa/login is called
console.log("wa-drive server starting... WhatsApp bot will be initialized on first login request.");

// Public endpoints
app.get("/", (req, res) => res.send("wa-drive is running 🚀"));
app.post("/login", login);

// Protected endpoints
app.get("/stat", authenticateToken, async (req, res) => {
  try {
    const response = {
      ...clientStatus,
      hasClient: !!globalClient,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      authenticatedUser: req.user
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get client status',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// WhatsApp logout endpoint
app.post("/wa/logout", authenticateToken, async (req, res) => {
  try {
    const result = await handleWhatsAppLogout(globalClient);
    
    if (result.success) {
      globalClient = null;
      clientStatus = {
        isReady: false,
        isAuthenticated: false,
        isConnected: false,
        lastUpdate: new Date().toISOString(),
        wwebVersion: null,
        error: 'Manually logged out'
      };
    }
    
    res.json({
      ...result,
      user: req.user.username
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to logout from WhatsApp',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// WhatsApp login endpoint - Create bot if needed and display QR code or status
app.post("/wa/login", authenticateToken, async (req, res) => {
  try {
    // If no client exists, create one
    if (!globalClient) {
      console.log("No WhatsApp client found, creating new one...");
      await startBot();
      
      // Wait a bit for the QR to generate
      let attempts = 0;
      const maxAttempts = 10; // 20 seconds total
      
      while (attempts < maxAttempts && globalClient) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const qrData = require('./config/wwjsConfig').getCurrentQRCode();
        
        if (qrData.hasQR) {
          console.log("✅ QR code generated successfully for new client");
          break;
        }
        
        attempts++;
        console.log(`Waiting for QR code generation... Attempt ${attempts}/${maxAttempts}`);
      }
    }
    
    const result = await handleWhatsAppLogin(globalClient, clientStatus, req);
    
    // For web browser display
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return res.send(generateQRHTML(result, req));
    }
    
    // For API/Postman response
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to process WhatsApp login request',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// WhatsApp reinitialize endpoint - Delete auth and generate new QR
app.post("/wa/reinitialize", authenticateToken, async (req, res) => {
  try {
    const result = await handleWhatsAppReinitialize(globalClient, req);
    
    // Get the new client if one was created
    if (result.clientCreated) {
      const newClient = getLatestClient();
      if (newClient) {
        globalClient = newClient;
        
        // Reset client status since we're starting fresh
        clientStatus = {
          isReady: false,
          isAuthenticated: false,
          isConnected: false,
          lastUpdate: new Date().toISOString(),
          wwebVersion: null,
          error: null
        };
      }
    }
    
    // For web browser display
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return res.send(generateQRHTML(result, req));
    }
    
    // For API/Postman response
    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to reinitialize WhatsApp',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
startBot();
