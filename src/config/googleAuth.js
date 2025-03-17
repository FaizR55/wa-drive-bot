const { google } = require("googleapis");
const fs = require("fs");

const CREDS = process.env.GOOGLE_CREDENTIALS; // Use env variable

const auth = new google.auth.GoogleAuth({
  keyFile: CREDS,
  scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"],
});

const sheets = google.sheets({ version: "v4", auth });
const drive = google.drive({ version: "v3", auth });

module.exports = { sheets, drive };
