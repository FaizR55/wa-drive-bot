const db = require("../db/sqlite");
const fs = require("fs");
const path = require("path");
const { addToSheetRaw, addToSheetData } = require('../services/googleSheets');
const uploadToDrive = require("../services/googleDrive");
const { createWP, closeWP, parseTemplate } = require("../services/openProject");
const { getMasterDataAll, getMasterDataByType } = require("../services/masterData");

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

      // let imageUrl = null;
      // const date = new Date().toISOString().replace('T', ' ').substring(0, 19);

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
        // Only handle messages that start with !
        if (!text.startsWith('!')) return;

        // Parse command and optional body
        const withoutBang = text.slice(1);
        const firstBreak = withoutBang.search(/[\s\n]/);
        const command = firstBreak === -1 ? withoutBang : withoutBang.slice(0, firstBreak);
        const body = firstBreak === -1 ? '' : withoutBang.slice(firstBreak + 1).trim();

        if (command === 'test') {
          // Preview parsed payload fields
          const { payload, errors, isValid } = parseTemplate(body);
          const lines = ['*Payload Preview*', '─────────────────'];
          for (const [key, val] of Object.entries(payload)) {
            const displayKey = key.charAt(0).toUpperCase() + key.slice(1);
            const displayValue = (val !== undefined && val !== null && String(val).trim()) ? String(val) : '-';
            lines.push(`*${displayKey}:* ${displayValue}`);
          }
          lines.push('');
          lines.push(isValid ? 'Validation: OK' : 'Validation: FAILED');
          if (errors.length) {
            errors.forEach((error, index) => lines.push(`${index + 1}. ${error}`));
          }
          try { await message.reply(lines.join('\n')); } catch (e) { console.error("reply error:", e.message); }

        } else if (command === 'newticket') {
          const { payload, errors, isValid } = parseTemplate(body);
          if (!isValid) {
            const lines = ['❌ Invalid ticket template', '─────────────────'];
            errors.forEach((error, index) => lines.push(`${index + 1}. ${error}`));
            try { await message.reply(lines.join('\n')); } catch (e) { console.error("reply error:", e.message); }
            return;
          }
          try { await message.reply("🎫 Creating ticket..."); } catch (e) { console.error("reply error:", e.message); }
          const result = await createWP(payload);
          if (!result || !result.success) {
            try { await message.reply("❌ Failed to create ticket: " + (result?.message || "Unknown error")); } catch (e) { console.error("reply error:", e.message); }
          } else {
            try { await message.reply("✅ Ticket created and closed on: " + result.message); } catch (e) { console.error("reply error:", e.message); }
          }

        } else if (command === 'op/master-data/get/all') {
          try {
            const data = await getMasterDataAll();
            if (!data.length) {
              await message.reply("No master data found.");
            } else {
              const lines = ['*Master Data (All)*', '─────────────────'];
              for (const item of data) {
                lines.push(`*${item.key}:*`);
                item.value.forEach((v, i) => lines.push(`  ${i + 1}. [${v.id}] ${v.value || v.name || '-'}`));
              }
              await message.reply(lines.join('\n'));
            }
          } catch (e) { console.error("reply error:", e.message); }

        } else if (command.startsWith('op/master-data/get/')) {
          const type = command.slice('op/master-data/get/'.length);
          try {
            const item = await getMasterDataByType(type);
            if (!item) {
              await message.reply(`❌ No master data found for type: *${type}*`);
            } else {
              const lines = [`*Master Data: ${item.key}*`, '─────────────────'];
              if (item.detail) lines.push(`_${item.detail}_`, '');
              item.value.forEach((v, i) => lines.push(`${i + 1}. [${v.id}] ${v.value || v.name || '-'}`));
              await message.reply(lines.join('\n'));
            }
          } catch (e) { console.error("reply error:", e.message); }

        } else if (command === 'template') {
          try {
            const item = await getMasterDataByType('template');
            if (!item) {
              await message.reply(`❌ No template data found.`);
            } else {
              const templateText = item.value.map(v => v.value || v.name || '-').join('\n');
              await message.reply(templateText);
            }
          } catch (e) { console.error("reply error:", e.message); }

        } else {
          try { await message.reply(`❓ Unknown command: *!${command}*`); } catch (e) { console.error("reply error:", e.message); }
        }
      }

      // await message.reply("✅ Message logged successfully!");
    }
  } catch (error) {
    console.error("Error handling message:", error);
  }
};

module.exports = handleMessage;
