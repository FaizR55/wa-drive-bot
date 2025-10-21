const db = require("../db/sqlite");
const fs = require("fs");
const path = require("path");
const { addToSheetRaw, addToSheetData } = require('../services/googleSheets');
const uploadToDrive = require("../services/googleDrive");

const handleMessage = async (client, message) => {
  try {
    if (message.isGroupMsg && message.mentionedJidList.length > 0) {

        console.log("📩 New message received:", message);

        const sender = message.sender.pushname || message.sender.id;
        let text = '';
        if (message.body) {
          text = message.body.replace(/@\d+/g, '').trim();
        }
        let imageUrl = null;
        const date = new Date().toISOString().replace('T', ' ').substring(0, 19);

        // If the message contains media (image, video, etc.)
        if (message.mimetype && message.mimetype.startsWith("image")) {
            if (message.caption) {
              text = message.caption.replace(/@\d+/g, '').trim();
            }
            console.log("🖼️ Image detected:", message.mimetype);
            console.log("Image caption:", message.caption);
            const mediaData = await client.decryptFile(message);
    
            // Check 'uploads' dir exists
            const uploadPath = path.join(__dirname, "../../uploads");
            if (!fs.existsSync(uploadPath)) {
                fs.mkdirSync(uploadPath, { recursive: true });
            }

            // Save file to local
            const extension = message.mimetype.split("/")[1];
            const filename = `${message.sender.id}-${Date.now()}-whatsapp.${extension}`
            const filePath = path.join(uploadPath, filename);
            fs.writeFileSync(filePath, mediaData);
            // Save to Drive
            require("fs").writeFileSync(filePath, mediaData);
            imageUrl = await uploadToDrive(filename, filePath);
    
            console.log(`✅ File saved: ${filename}`);
        }

        db.run(`INSERT INTO messages (sender, message, image_url) VALUES (?, ?, ?)`, [sender, text, imageUrl]);

        await addToSheetRaw([sender, text, imageUrl || "No Image", date]);
        await addToSheetData([sender, text, imageUrl || "No Image", date]);
        await message.reply("✅ Message logged successfully!");
        console.log(); 
    }
  } catch (error) {
    console.error("Error handling message:", error);
  }
};

module.exports = handleMessage;
