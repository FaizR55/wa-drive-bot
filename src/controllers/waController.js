const { handleWhatsAppLogin, handleWhatsAppLogout, handleWhatsAppReinitialize, getLatestClient, generateQRHTML } = require("../config/wwjsConfig");
const globalState = require("../config/globalState");

// WhatsApp logout controller
const logout = async (req, res) => {
  try {
    const globalClient = globalState.getClient();
    const result = await handleWhatsAppLogout(globalClient);
    
    if (result.success) {
      globalState.setClient(null);
      globalState.setStatus({
        isReady: false,
        isAuthenticated: false,
        isConnected: false,
        lastUpdate: new Date().toISOString(),
        wwebVersion: null,
        error: 'Manually logged out'
      });
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
};

// WhatsApp login controller - Create bot if needed and display QR code or status
const login = async (req, res, startBot) => {
  try {
    let globalClient = globalState.getClient();
    const clientStatus = globalState.getStatus();
    
    // If no client exists, create one
    if (!globalClient) {
      console.log("No WhatsApp client found, creating new one...");
      await startBot();
      
      // Wait a bit for the QR to generate
      let attempts = 0;
      const maxAttempts = 10; // 20 seconds total
      
      while (attempts < maxAttempts && globalState.getClient()) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const qrData = require('../config/wwjsConfig').getCurrentQRCode();
        
        if (qrData.hasQR) {
          console.log("✅ QR code generated successfully for new client");
          break;
        }
        
        attempts++;
        console.log(`Waiting for QR code generation... Attempt ${attempts}/${maxAttempts}`);
      }
      
      globalClient = globalState.getClient();
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
};

// WhatsApp reinitialize controller - Delete auth and generate new QR
const reinitialize = async (req, res) => {
  try {
    const globalClient = globalState.getClient();
    const result = await handleWhatsAppReinitialize(globalClient, req);
    
    // Get the new client if one was created
    if (result.clientCreated) {
      const newClient = getLatestClient();
      if (newClient) {
        globalState.setClient(newClient);
        
        // Reset client status since we're starting fresh
        globalState.resetStatus();
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
};

// Status controller
const getStatus = async (req, res) => {
  try {
    const clientStatus = globalState.getStatus();
    const globalClient = globalState.getClient();
    
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
};

module.exports = {
  login,
  logout,
  reinitialize,
  getStatus
};