const express = require("express");
const { handleWhatsAppLogin, handleWhatsAppLogout, handleWhatsAppReinitialize, getLatestClient, generateQRHTML } = require("./config/wwjsConfig");
const { authenticateToken, login } = require("./services/auth");

const router = express.Router();

// Global client variable to store the WhatsApp client (will be set from app.js)
let globalClient = null;
let clientStatus = null;

// Function to set globals from app.js
function setGlobals(client, status) {
  globalClient = client;
  clientStatus = status;
}

// Public endpoints
router.get("/", (req, res) => res.send("wa-drive is running 🚀"));
router.post("/login", login);

// Protected endpoints
router.get("/stat", authenticateToken, async (req, res) => {
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
router.post("/wa/logout", authenticateToken, async (req, res) => {
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
router.post("/wa/login", authenticateToken, async (req, res) => {
  try {
    // If no client exists, create one
    if (!globalClient) {
      const { createBot } = require("./config/wwjsConfig");
      console.log("No WhatsApp client found, creating new one...");
      const newClient = await createBot();
      globalClient = newClient;
      
      // Wait a bit for the QR to generate
      let attempts = 0;
      const maxAttempts = 10;
      
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
    
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return res.send(generateQRHTML(result, req));
    }
    
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

// WhatsApp reinitialize endpoint
router.post("/wa/reinitialize", authenticateToken, async (req, res) => {
  try {
    const result = await handleWhatsAppReinitialize(globalClient, req);
    
    if (result.clientCreated) {
      const newClient = getLatestClient();
      if (newClient) {
        globalClient = newClient;
        
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
    
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return res.send(generateQRHTML(result, req));
    }
    
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

module.exports = {
  router,
  setGlobals
};
