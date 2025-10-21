const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

const createBot = async () => {
  try {
    const client = new Client({
      authStrategy: new LocalAuth({ dataPath: "tokens/.wwebjs_auth" }),
      puppeteer: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    });

    client.on("qr", (qr) => {
      console.log("Scan this QR to log in:");
      qrcode.generate(qr, { small: true });
    });

    client.on("ready", () => {
      console.log("✅ WhatsApp client is ready!");
    });

    client.on("disconnected", (reason) => {
      console.log("⚠️ WhatsApp disconnected:", reason);
    });

    client.initialize();

    console.log("✅ WhatsApp Bot is ready!");
    return client;
  } catch (error) {
    console.error("❌ Error on createBot:", error);
  }
};

module.exports = createBot;
