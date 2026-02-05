const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode");
const fs = require('fs');
const path = require('path');

// Store current QR code for web display
let currentQRCode = null;
let qrCodeBase64 = null;

// Prevent multiple initializations
let isInitializing = false;

const createBot = async () => {
  console.log("wa-drive is starting...");
  try {
    const client = new Client({
      authStrategy: new LocalAuth({ dataPath: "tokens/.wwebjs_auth" }),
      puppeteer: {
        headless: true,
        timeout: 300000, // 5 minutes for longer QR availability
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-web-security",
          "--disable-dev-shm-usage"
        ],
      },
    });

    client.initialize();

    client.on('loading_screen', (percent, message) => {
        console.log('Loading screen: ', percent, message);
    });

    client.on('qr', async (qr) => {
      console.log("Scan this QR to log in:");
      qrcode.generate(qr, { small: true });
      
      // Store QR code for web display
      currentQRCode = qr;
      try {
        qrCodeBase64 = await QRCode.toDataURL(qr);
        console.log("✅ QR Code generated for web display");
      } catch (err) {
        console.error("❌ Error generating QR code:", err);
      }
    });

    client.on('authenticated', () => {
      console.log('AUTHENTICATED ✅');
      // Clear QR code after authentication
      currentQRCode = null;
      qrCodeBase64 = null;
    });

    client.on('disconnected', () => {
      console.log('WhatsApp client disconnected');
      // Clear QR code on disconnect
      currentQRCode = null;
      qrCodeBase64 = null;
    });

    return client;
  } catch (error) {
    console.error("❌ Error on createBot:", error);
  }
};

// Function to disconnect WhatsApp client
const disconnectWhatsApp = async (client) => {
  try {
    if (client) {
      await client.destroy();
      console.log("✅ WhatsApp client disconnected successfully");
      return { success: true, message: "WhatsApp disconnected successfully" };
    } else {
      return { success: false, message: "No active WhatsApp client found" };
    }
  } catch (error) {
    console.error("❌ Error disconnecting WhatsApp:", error);
    return { success: false, message: "Error disconnecting WhatsApp", error: error.message };
  }
};

// Function to get current QR code for web display
const getCurrentQRCode = () => {
  return {
    qrCode: currentQRCode,
    qrCodeBase64: qrCodeBase64,
    hasQR: !!currentQRCode
  };
};

// Function to reinitialize WhatsApp connection (for getting new QR)
const reinitializeWhatsApp = async (client) => {
  // Prevent multiple simultaneous initializations
  if (isInitializing) {
    throw new Error("WhatsApp is already being initialized. Please wait.");
  }

  try {
    isInitializing = true;
    
    if (client) {
      console.log("Destroying existing client...");
      await client.destroy();
      // Wait longer to ensure browser fully closes
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Clear stored QR codes
    currentQRCode = null;
    qrCodeBase64 = null;
    
    console.log("Creating new WhatsApp client...");
    const newClient = await createBot();
    
    return newClient;
  } catch (error) {
    console.error("❌ Error reinitializing WhatsApp:", error);
    throw error;
  } finally {
    isInitializing = false;
  }
};

// Function to handle WhatsApp login (QR code display)
const handleWhatsAppLogin = async (client, clientStatus, req) => {
  try {
    // Check if already logged in and ready
    if (clientStatus.isReady && clientStatus.isAuthenticated) {
      return {
        success: true,
        alreadyLoggedIn: true,
        message: "WhatsApp is already logged in and ready",
        clientStatus: clientStatus,
        timestamp: new Date().toISOString(),
        user: req.user.username
      };
    }

    // Check if client exists and is authenticated (but maybe not ready)
    if (client && clientStatus.isAuthenticated && !clientStatus.isReady) {
      return {
        success: true,
        alreadyLoggedIn: true,
        message: "WhatsApp is authenticated but still loading. Please wait a moment.",
        clientStatus: clientStatus,
        timestamp: new Date().toISOString(),
        user: req.user.username
      };
    }

    // Check if QR code is available
    const qrData = getCurrentQRCode();
    if (qrData.hasQR) {
      console.log("Displaying existing QR code");
      return {
        success: true,
        ...generateQRResponse(qrData, req)
      };
    }

    // No QR code available and not authenticated
    return {
      success: false,
      message: "No QR code available. Please use the reinitialize endpoint to generate a new QR code.",
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    return {
      success: false,
      error: 'Failed to process WhatsApp login request',
      message: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

// Store the latest client for retrieval
let latestClient = null;

// Function to get the latest created client
const getLatestClient = () => {
  const client = latestClient;
  latestClient = null; // Clear after retrieval
  return client;
};

// Function to completely reinitialize WhatsApp (delete auth and restart)
const handleWhatsAppReinitialize = async (client, req) => {
  // Prevent multiple simultaneous reinitializations
  if (isInitializing) {
    return {
      success: false,
      message: "WhatsApp is already being reinitialized. Please wait and try again in a few seconds.",
      timestamp: new Date().toISOString()
    };
  }

  try {
    isInitializing = true;
    console.log("🔄 Starting WhatsApp complete reinitialization...");
    
    // Step 1: Destroy existing client
    if (client) {
      console.log("Destroying existing client...");
      await client.destroy();
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Step 2: Delete auth folder
    const authPath = path.join(process.cwd(), 'tokens', '.wwebjs_auth');
    console.log(`Deleting auth folder: ${authPath}`);
    
    if (fs.existsSync(authPath)) {
      await deleteFolder(authPath);
      console.log("✅ Auth folder deleted successfully");
    } else {
      console.log("Auth folder doesn't exist, skipping deletion");
    }
    
    // Step 3: Clear stored QR codes
    currentQRCode = null;
    qrCodeBase64 = null;
    
    // Step 4: Create new client
    console.log("Creating new WhatsApp client...");
    const newClient = await createBot();
    latestClient = newClient; // Store for retrieval
    
    // Step 5: Wait for QR generation
    console.log("Waiting for QR code generation...");
    let attempts = 0;
    const maxAttempts = 15; // 30 seconds total
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const qrData = getCurrentQRCode();
      
      if (qrData.hasQR) {
        console.log("✅ New QR code generated successfully after reinitialization");
        return {
          success: true,
          message: "WhatsApp reinitialized successfully. New QR code generated.",
          clientCreated: true, // Just a flag to indicate new client was created
          ...generateQRResponse(qrData, req)
        };
      }
      
      attempts++;
      console.log(`Waiting for QR code generation... Attempt ${attempts}/${maxAttempts}`);
    }
    
    // If no QR after all attempts
    return {
      success: false,
      message: "WhatsApp client was reinitialized but QR code generation timed out. Please try the login endpoint.",
      clientCreated: true, // Just a flag to indicate new client was created
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error("❌ Error during reinitialization:", error);
    return {
      success: false,
      error: "Failed to reinitialize WhatsApp",
      message: error.message,
      timestamp: new Date().toISOString()
    };
  } finally {
    isInitializing = false;
  }
};

// Helper function to recursively delete folder
const deleteFolder = async (folderPath) => {
  return new Promise((resolve, reject) => {
    fs.rm(folderPath, { recursive: true, force: true }, (err) => {
      if (err) {
        console.error(`Error deleting folder ${folderPath}:`, err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

// Function to handle WhatsApp logout
const handleWhatsAppLogout = async (client) => {
  try {
    if (!client) {
      return {
        success: false,
        message: "No active WhatsApp client found to logout",
        timestamp: new Date().toISOString()
      };
    }
    
    console.log("Logging out WhatsApp client...");
    await client.destroy();
    
    // Clear QR codes
    currentQRCode = null;
    qrCodeBase64 = null;
    
    console.log("✅ WhatsApp client logged out successfully");
    return {
      success: true,
      message: "WhatsApp logged out successfully",
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error("❌ Error logging out WhatsApp:", error);
    return {
      success: false,
      message: "Error logging out WhatsApp",
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};
const generateQRResponse = (qrData, req) => {
  return {
    message: "QR code generated successfully",
    qrCodeBase64: qrData.qrCodeBase64,
    qrCode: qrData.qrCode,
    timestamp: new Date().toISOString(),
    user: req.user.username,
    instructions: {
      step1: "Open WhatsApp on your phone",
      step2: "Go to Settings > Linked Devices",
      step3: "Tap 'Link a Device'",
      step4: "Scan the QR code above"
    }
  };
};

// Helper function to generate HTML for web display
const generateQRHTML = (qrData, req) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>WhatsApp QR Code</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { 
          font-family: Arial, sans-serif; 
          text-align: center; 
          padding: 20px;
          background: #f5f5f5;
        }
        .container {
          max-width: 500px;
          margin: 0 auto;
          background: white;
          border-radius: 10px;
          padding: 30px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        img { 
          border: 2px solid #25D366; 
          border-radius: 10px;
          margin: 20px 0;
        }
        h1 { color: #25D366; }
        .info { 
          background: #e8f5e8; 
          padding: 15px; 
          border-radius: 5px; 
          margin: 20px 0;
        }
        .already-logged { 
          background: #d4edda; 
          color: #155724; 
          border: 1px solid #c3e6cb; 
          padding: 20px; 
          border-radius: 5px; 
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🚀 wa-drive WhatsApp Login</h1>
        ${qrData.alreadyLoggedIn ? 
          `<div class="already-logged">
            <h2>✅ Already Logged In!</h2>
            <p>WhatsApp is already connected and ready to use.</p>
            <p><strong>Status:</strong> ${qrData.message}</p>
          </div>` 
          : 
          `<div class="info">
            <p><strong>📱 Scan this QR code with your WhatsApp:</strong></p>
            <p>Open WhatsApp > Settings > Linked Devices > Link a Device</p>
          </div>
          <img src="${qrData.qrCodeBase64}" alt="WhatsApp QR Code" width="300">`
        }
        <p><small>Generated at: ${new Date().toLocaleString()}</small></p>
        <p><small>User: ${req.user.username}</small></p>
      </div>
    </body>
    </html>
  `;
};

module.exports = {
  createBot,
  disconnectWhatsApp, // Keep for backward compatibility
  getCurrentQRCode,
  reinitializeWhatsApp, // Keep for backward compatibility
  handleWhatsAppLogin,
  handleWhatsAppLogout,
  handleWhatsAppReinitialize,
  getLatestClient,
  generateQRHTML
};
