const { sheets } = require("../config/googleAuth");

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const addToSheetRaw = async (data) => {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "raw!A:D",
      valueInputOption: "RAW",
      requestBody: { values: [data] },
    });
    console.log("Data added to Google Sheet Raw");
  } catch (error) {
    console.error("Error adding data to sheet raw:", error);
  }
};

const addToSheetData = async (data) => {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "data!A:D",
      valueInputOption: "RAW",
      requestBody: { values: [data] },
    });
    console.log("Data added to Google Sheet Data");
  } catch (error) {
    console.error("Error adding data to sheet data:", error);
  }
};

module.exports = {
  addToSheetRaw,
  addToSheetData,
};
