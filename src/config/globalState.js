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

module.exports = {
  getClient: () => globalClient,
  setClient: (client) => { globalClient = client; },
  getStatus: () => clientStatus,
  setStatus: (status) => { clientStatus = { ...clientStatus, ...status }; },
  resetStatus: () => {
    clientStatus = {
      isReady: false,
      isAuthenticated: false,
      isConnected: false,
      lastUpdate: new Date().toISOString(),
      wwebVersion: null,
      error: null
    };
  }
};