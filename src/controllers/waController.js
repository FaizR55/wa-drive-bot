const { handleWhatsAppLogin, handleWhatsAppLogout, handleWhatsAppReinitialize, getLatestClient, generateQRHTML, startBot } = require("../config/wwjsConfig");
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
const login = async (req, res) => {
  try {
    let globalClient = globalState.getClient();
    let clientStatus = globalState.getStatus();
    
    // If no client exists, create one
    if (!globalClient) {
      console.log("No WhatsApp client found, starting new one...");
      const newClient = await startBot();
      
      // Set client in global state immediately after creation
      if (newClient) {
        globalState.setClient(newClient);
        globalClient = newClient;
        console.log("✅ Client created and set in global state");
      }
      
      // Wait and retry checking client status after startBot
      console.log("Waiting for client to be ready...");
      let statusCheckAttempts = 0;
      const maxStatusCheckAttempts = 10; // 20 seconds total
      while (statusCheckAttempts < maxStatusCheckAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        globalClient = globalState.getClient();
        clientStatus = globalState.getStatus();
        
        if (clientStatus.isReady && clientStatus.isAuthenticated) {
          console.log("✅ Client is ready and authenticated");
          globalClient = globalState.getClient(); // Update globalClient immediately
          break;
        }
        
        statusCheckAttempts++;
        console.log(`Status check ${statusCheckAttempts}/${maxStatusCheckAttempts}...`);
      }
      
      // Re-check status after the waiting loop
      clientStatus = globalState.getStatus();
      
      // Only wait for QR if client is NOT fully ready and authenticated
      if (!(clientStatus && clientStatus.isReady && clientStatus.isAuthenticated)) {
        console.log("Client needs QR authentication, waiting for QR code...");
        
        // Wait a bit for the QR to generate
        let attempts = 0;
        const maxAttempts = 5; // 10 seconds total
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          const qrData = require('../config/wwjsConfig').getCurrentQRCode();
          
          if (qrData.hasQR) {
            console.log("✅ QR code generated successfully for new client");
            break;
          }
          
          attempts++;
          console.log(`Waiting for QR code generation... Attempt ${attempts}/${maxAttempts}`);
        }
      }
      
      // Update client
      if (!globalClient) {
        globalClient = globalState.getClient();
      }
    }
    
    // Return response template
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

const reinitialize = async (req, res) => {
  try {
    const globalClient = globalState.getClient();
    const result = await handleWhatsAppReinitialize(globalClient, req);

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