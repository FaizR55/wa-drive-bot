require("dotenv").config();
const express = require("express");
const createBot = require("./config/venomConfig");
const handleMessage = require("./controllers/messageController");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => res.send("WhatsApp Bot is Running 🚀"));

const startBot = async () => {
  const client = await createBot();

  if (client) {
    client.onMessage((message) => handleMessage(client, message));

    // Handle session loss and auto-reconnect
    client.onStateChange((state) => {
      console.log("🔄 WhatsApp State Changed:", state);

      const statesToRestart = ["CONFLICT", "UNPAIRED", "UNPAIRED_IDLE"];

      if (statesToRestart.includes(state)) {
        console.log("⚠️ Reconnecting...");
        setTimeout(() => startBot(), 5000); // Restart after 5 seconds
      }
    });

    // Handle when the session becomes invalid
    client.onStreamChange((state) => {
      console.log("🛑 Stream State Changed:", state);

      if (state === "DISCONNECTED" || state === "CLOSE") {
        console.log("🚪 Disconnected, restarting bot...");
        setTimeout(() => startBot(), 5000);
      }
    });
  }
};

startBot();

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
