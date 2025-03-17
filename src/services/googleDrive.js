const fs = require("fs");
const { drive } = require("../config/googleAuth");

const FOLDER_ID = process.env.DRIVE_FOLDER_ID;

const uploadToDrive = async (filename, filePath) => {
  try {
    const fileMetadata = {
      name: filename,
      parents: [FOLDER_ID],
    };
    const media = {
      mimeType: "image/jpeg",
      body: fs.createReadStream(filePath),
    };

    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: "id",
    });

    return `https://drive.google.com/uc?id=${response.data.id}`;
  } catch (error) {
    console.error("Error uploading image:", error);
  }
};

module.exports = uploadToDrive;
