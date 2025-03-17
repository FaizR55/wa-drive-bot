const venom = require("venom-bot");

const createBot = async () => {
  try {
    const client = await venom.create({
      session: "wa-session", // Name of the session folder
      multidevice: true, // Enables multi-device support
      headless: true, // Runs in headless mode
      useChrome: false, // Use Chromium instead of Chrome
      autoClose: false, // Prevent auto-closing
      disableSpins: true, // Disables loading animations
    });

    console.log("✅ WhatsApp Bot is ready!");
    return client;
  } catch (error) {
    console.error("❌ Error creating Venom bot:", error);
  }
};

module.exports = createBot;
