const express = require("express");
const axios = require("axios");
const { authenticateToken } = require("./auth");

const router = express.Router();

// Database instance
let db = null;
function setDatabase(database) {
  db = database;
}

const BASE_URL = process.env.OP_URL;
const TOKEN = process.env.OP_KEY;
const PROJECT = process.env.OP_PROJECT;

const basicAuth = Buffer.from(`apikey:${TOKEN}`).toString('base64');
const headers = {
  Authorization: `Basic ${basicAuth}`,
  Accept: "application/hal+json",
  "Content-Type": "application/json"
};

function normalizeMasterDataValue(rawValue) {
  if (typeof rawValue === "string") {
    return JSON.parse(rawValue);
  }

  return rawValue;
}

function isValidMasterDataValue(value) {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((item) => (
    item &&
    typeof item === "object" &&
    Number.isInteger(item.id) &&
    typeof item.value === "string"
  ));
}

function validateMasterDataPayload(payload, options = {}) {
  const { requireDetail = false } = options;
  const { key, value, detail } = payload;

  if (!key || typeof key !== "string") {
    return "Field 'key' is required and must be a non-empty string";
  }

  if (!isValidMasterDataValue(value)) {
    return "Field 'value' must be an array with items in the format [{\"id\":10,\"value\":\"Issue\"}]";
  }

  if (requireDetail && detail !== undefined && typeof detail !== "string") {
    return "Field 'detail' must be a string when provided";
  }

  return null;
}

function parseMasterDataPayload(payload, options = {}) {
  let normalizedValue;

  try {
    normalizedValue = normalizeMasterDataValue(payload.value);
  } catch (error) {
    return {
      error: "Field 'value' must be valid JSON when provided as a string"
    };
  }

  const normalizedPayload = {
    ...payload,
    value: normalizedValue
  };

  const validationError = validateMasterDataPayload(normalizedPayload, options);

  if (validationError) {
    return { error: validationError };
  }

  return { data: normalizedPayload };
}

// Supported master data types
const SUPPORTED_TYPES = ["type", "priority", "assignee", "status"];

// Helper function to run database queries
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

// Helper function to get data from database
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Helper function to get all rows
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

router.post("/master-data/create", authenticateToken, async (req, res) => {
  try {
    const parsedPayload = parseMasterDataPayload(req.body);

    if (parsedPayload.error) {
      return res.status(400).json({
        success: false,
        error: "Invalid payload",
        message: parsedPayload.error,
        timestamp: new Date().toISOString()
      });
    }

    const { key, value, detail } = parsedPayload.data;
    const existingRecord = await dbGet(
      "SELECT id FROM master_data WHERE key = ?",
      [key]
    );

    if (existingRecord) {
      return res.status(409).json({
        success: false,
        error: "Master data already exists",
        message: `Master data with key '${key}' already exists`,
        key,
        timestamp: new Date().toISOString()
      });
    }

    await dbRun(
      "INSERT INTO master_data (key, value, detail) VALUES (?, ?, ?)",
      [key, JSON.stringify(value), detail || null]
    );

    res.status(201).json({
      success: true,
      message: `Master data for ${key} created successfully`,
      key,
      value,
      detail: detail || null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error creating master data:", error.message);

    res.status(500).json({
      success: false,
      error: "Failed to create master data",
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.put("/master-data/update", authenticateToken, async (req, res) => {
  try {
    const parsedPayload = parseMasterDataPayload(req.body);

    if (parsedPayload.error) {
      return res.status(400).json({
        success: false,
        error: "Invalid payload",
        message: parsedPayload.error,
        timestamp: new Date().toISOString()
      });
    }

    const { key, value } = parsedPayload.data;
    const existingRecord = await dbGet(
      "SELECT id, detail FROM master_data WHERE key = ?",
      [key]
    );

    if (!existingRecord) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: `No master data found for key: ${key}`,
        key,
        timestamp: new Date().toISOString()
      });
    }

    await dbRun(
      "UPDATE master_data SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?",
      [JSON.stringify(value), key]
    );

    res.json({
      success: true,
      message: `Master data for ${key} updated successfully`,
      key,
      value,
      detail: existingRecord.detail,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error updating master data:", error.message);

    res.status(500).json({
      success: false,
      error: "Failed to update master data",
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Sync master data from external API
router.post("/master-data/sync/:type", authenticateToken, async (req, res) => {
  try {
    const { type } = req.params;

    // Validate type
    if (!SUPPORTED_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        error: "Invalid type",
        message: `Type must be one of: ${SUPPORTED_TYPES.join(", ")}`,
        timestamp: new Date().toISOString()
      });
    }

    // Map type to API endpoint
    const typeMap = {
      "type": "types",
      "priority": "priorities",
      "assignee": "users",
      "status": "statuses",
      "location": "custom_fields/2",
      "process": "custom_fields/7",
      "category": "custom_fields/8",
    };

    const apiEndpoint = `${BASE_URL}/api/v3/${typeMap[type]}`;

    console.log(`Fetching ${type} data from ${apiEndpoint}...`);

    // Fetch data from external API
    // const response = await axios.get(apiEndpoint);

    let response;
    try {
      response = await axios.get(
        apiEndpoint,
        { headers }
      );
    } catch (apiErr) {
      // Axios error: show status and message
      const apiErrorMsg = apiErr.response?.data?.message || apiErr.response?.data || apiErr.message;
      console.error("API Error (getMasterData):", apiErrorMsg);
      return res.status(500).json({ success: false, message: `Failed to fetch master data: ${apiErrorMsg}` });
    }

    // console.log("API Response Data:", JSON.stringify(response.data, null, 2));
    if (!response.data || !response.data._embedded || !response.data._embedded.elements) {
      return res.status(400).json({
        success: false,
        error: "Invalid API response",
        message: "API response does not contain expected structure",
        timestamp: new Date().toISOString()
      });
    }

    // Extract elements and map to simple format
    const elements = response.data._embedded.elements;
    const mappedData = elements.map(el => ({
      id: el.id,
      value: el.name
    }));

    // Convert to JSON string for storage
    const valueJson = JSON.stringify(mappedData);

    // Check if record exists
    const existingRecord = await dbGet(
      "SELECT id FROM master_data WHERE key = ?",
      [type]
    );

    if (existingRecord) {
      // Update existing record
      await dbRun(
        "UPDATE master_data SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?",
        [valueJson, type]
      );
    } else {
      // Insert new record
      await dbRun(
        "INSERT INTO master_data (key, value) VALUES (?, ?)",
        [type, valueJson]
      );
    }

    res.json({
      success: true,
      message: `Master data for ${type} updated successfully`,
      type,
      count: mappedData.length,
      data: mappedData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`Error updating master data for ${req.params.type}:`, error.message);

    res.status(500).json({
      success: false,
      error: "Failed to update master data",
      message: error.message,
      type: req.params.type,
      timestamp: new Date().toISOString()
    });
  }
});

// Get master data from database
router.get("/master-data/get/all", authenticateToken, async (req, res) => {
  try {
    const records = await dbAll("SELECT * FROM master_data ORDER BY key ASC");

    const data = records.map((record) => ({
      key: record.key,
      value: JSON.parse(record.value),
      detail: record.detail,
      created_at: record.created_at,
      updated_at: record.updated_at
    }));

    res.json({
      success: true,
      count: data.length,
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error fetching all master data:", error.message);

    res.status(500).json({
      success: false,
      error: "Failed to fetch all master data",
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.get("/master-data/get/:type", authenticateToken, async (req, res) => {
  try {
    const { type } = req.params;

    // Validate type
    if (!SUPPORTED_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        error: "Invalid type",
        message: `Type must be one of: ${SUPPORTED_TYPES.join(", ")}`,
        timestamp: new Date().toISOString()
      });
    }

    // Fetch from database
    const record = await dbGet(
      "SELECT * FROM master_data WHERE key = ?",
      [type]
    );

    if (!record) {
      return res.status(404).json({
        success: false,
        error: "Not found",
        message: `No master data found for type: ${type}`,
        type,
        timestamp: new Date().toISOString()
      });
    }

    // Parse the JSON value
    const data = JSON.parse(record.value);

    res.json({
      success: true,
      type,
      count: data.length,
      data,
      detail: record.detail,
      created_at: record.created_at,
      updated_at: record.updated_at,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`Error fetching master data for ${req.params.type}:`, error.message);

    res.status(500).json({
      success: false,
      error: "Failed to fetch master data",
      message: error.message,
      type: req.params.type,
      timestamp: new Date().toISOString()
    });
  }
});

async function getMasterDataAll() {
  const records = await dbAll("SELECT * FROM master_data ORDER BY key ASC");
  return records.map((record) => {
    let parsedValue;
    try {
      parsedValue = JSON.parse(record.value);
    } catch (e) {
      // If value is not JSON, treat it as a plain string
      parsedValue = [{ id: 0, value: record.value }];
    }
    return {
      key: record.key,
      value: parsedValue,
      detail: record.detail
    };
  });
}

async function getMasterDataByType(type) {
  const record = await dbGet("SELECT * FROM master_data WHERE key = ?", [type]);
  if (!record) return null;

  let parsedValue;
  try {
    parsedValue = JSON.parse(record.value);
  } catch (e) {
    // If value is not JSON, treat it as a plain string
    parsedValue = [{ id: 0, value: record.value }];
  }

  return {
    key: record.key,
    value: parsedValue,
    detail: record.detail
  };
}

module.exports = {
  masterDataRouter: router,
  setDatabase,
  getMasterDataAll,
  getMasterDataByType
};
