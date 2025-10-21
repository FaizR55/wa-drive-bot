require("dotenv").config();
const express = require("express");
const createBot = require("./config/wwjsConfig");
const handleMessage = require("./controllers/messageController");

const app = express();
const PORT = process.env.PORT || 3000;


const startBot = async () => {
  const client = await createBot();

  if (client) {
    client.on("message", async (message) => {
      try {
        console.log("Incoming message:", message);
        await handleMessage(client, message);
      } catch (error) {
        console.error("Error handling message:", error);
      }
    });
  }
};
startBot();

app.get("/", (req, res) => res.send("WhatsApp Bot is Running 🚀"));
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
