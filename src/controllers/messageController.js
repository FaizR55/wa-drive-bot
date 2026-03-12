const db = require("../db/sqlite");
const fs = require("fs");
const path = require("path");
const { addToSheetRaw, addToSheetData } = require('../services/googleSheets');
const uploadToDrive = require("../services/googleDrive");
const { createWP, closeWP } = require("../services/openProject");

const handleMessage = async (client, message) => {
  try {
    // wwjs check if message is from group and has mentions
    const isGroupMsg = message.from && message.from.endsWith('@g.us');
    const mentionedJidList = message.mentionedIds || [];
    if (isGroupMsg && mentionedJidList.length > 0) {
      console.log("📩 New message received:", message);

      // In wwjs, message.author is the sender's ID in group chats
      const sender = message._data?.notifyName || message.author || message.from;
      let text = '';
      if (message.body) {
        text = message.body.replace(/@\d+/g, '').trim();
      }
      let imageUrl = null;
      const date = new Date().toISOString().replace('T', ' ').substring(0, 19);

      // If the message contains media (image, video, etc.)
      // if (message.hasMedia && message.type === 'image') {
      //   if (message.caption) {
      //     text = message.caption.replace(/@\d+/g, '').trim();
      //   }
      //   console.log("🖼️ Image detected:", message.type);
      //   console.log("Image caption:", message.caption);
      //   const mediaData = await message.downloadMedia();

      //   // Check 'uploads' dir exists
      //   const uploadPath = path.join(__dirname, "../../uploads");
      //   if (!fs.existsSync(uploadPath)) {
      //     fs.mkdirSync(uploadPath, { recursive: true });
      //   }

      //   // Save file to local
      //   const extension = mediaData.mimetype.split("/")[1];
      //   const filename = `${sender}-${Date.now()}-whatsapp.${extension}`;
      //   const filePath = path.join(uploadPath, filename);
      //   fs.writeFileSync(filePath, Buffer.from(mediaData.data, 'base64'));
      //   imageUrl = await uploadToDrive(filename, filePath);
      //   console.log(`✅ File saved: ${filename}`);
      // }

      if (message.body) {
        
        const createWPResult = await createWP(text);
        if (!createWPResult || !createWPResult.success) {
          await message.reply("❌ Failed to create Work Package: " + (createWPResult?.message || "Unknown error"));
          return;
        }

        const wpId = createWPResult.wpId;
        const lockVersion = createWPResult.lockVersion;
        const msg = createWPResult.message;

        await message.reply("Work Package successfully created on : " + msg);

        const closeWPResult = await closeWP(wpId, lockVersion);
        if (!closeWPResult || !closeWPResult.success) {
          await message.reply("❌ Failed to close Work Package: " + (closeWPResult?.message || "Unknown error"));
          return;
        }
        await message.reply("Work Package successfully closed!");
        
        // db.run(`INSERT INTO messages (sender, message, image_url) VALUES (?, ?, ?)`, [sender, detail, imageUrl]);

        // await addToSheetRaw([sender, detail, imageUrl || "No Image", date]);
        // await addToSheetData([sender, detail, imageUrl || "No Image", date]);
      }

      await message.reply("✅ Message logged successfully!");
    }
  } catch (error) {
    console.error("Error handling message:", error);
  }
};

module.exports = handleMessage;
