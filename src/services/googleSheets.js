const { sheets } = require("../config/googleAuth");

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const addToSheet = async (data) => {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Sheet1!A:D",
      valueInputOption: "RAW",
      requestBody: { values: [data] },
    });
    console.log("Data added to Google Sheet");
  } catch (error) {
    console.error("Error adding data to sheet:", error);
  }
};

module.exports = addToSheet;
