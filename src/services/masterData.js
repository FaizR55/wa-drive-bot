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

async function createMasterData(key, value, detail) {
  const parsedPayload = parseMasterDataPayload({ key, value, detail });
  if (parsedPayload.error) return { success: false, status: 400, error: "Invalid payload", message: parsedPayload.error, timestamp: new Date().toISOString() };

  const { key: k, value: v, detail: d } = parsedPayload.data;
  const existing = await dbGet("SELECT id FROM master_data WHERE key = ?", [k]);
  if (existing) return { success: false, status: 409, error: "Master data already exists", message: `Master data with key '${k}' already exists`, key: k, timestamp: new Date().toISOString() };

  await dbRun("INSERT INTO master_data (key, value, detail) VALUES (?, ?, ?)", [k, JSON.stringify(v), d || null]);
  return { success: true, status: 201, message: `Master data for ${k} created successfully`, key: k, value: v, detail: d || null, timestamp: new Date().toISOString() };
}

async function updateMasterData(key, value) {
  const parsedPayload = parseMasterDataPayload({ key, value });
  if (parsedPayload.error) return { success: false, status: 400, error: "Invalid payload", message: parsedPayload.error, timestamp: new Date().toISOString() };

  const { key: k, value: v } = parsedPayload.data;
  const existing = await dbGet("SELECT id, detail FROM master_data WHERE key = ?", [k]);
  if (!existing) return { success: false, status: 404, error: "Not found", message: `No master data found for key: ${k}`, key: k, timestamp: new Date().toISOString() };

  await dbRun("UPDATE master_data SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?", [JSON.stringify(v), k]);
  return { success: true, status: 200, message: `Master data for ${k} updated successfully`, key: k, value: v, detail: existing.detail, timestamp: new Date().toISOString() };
}

router.post("/master-data/create", authenticateToken, async (req, res) => {
  try {
    const result = await createMasterData(req.body.key, req.body.value, req.body.detail);
    res.status(result.status).json(result);
  } catch (error) {
    console.error("Error creating master data:", error.message);
    res.status(500).json({ success: false, error: "Failed to create master data", message: error.message, timestamp: new Date().toISOString() });
  }
});

router.put("/master-data/update", authenticateToken, async (req, res) => {
  try {
    const result = await updateMasterData(req.body.key, req.body.value);
    res.status(result.status).json(result);
  } catch (error) {
    console.error("Error updating master data:", error.message);
    res.status(500).json({ success: false, error: "Failed to update master data", message: error.message, timestamp: new Date().toISOString() });
  }
});

async function syncMasterData(type) {
  if (!SUPPORTED_TYPES.includes(type)) {
    return { success: false, status: 400, error: "Invalid type", message: `Type must be one of: ${SUPPORTED_TYPES.join(", ")}`, timestamp: new Date().toISOString() };
  }

  const typeMap = { type: "types", priority: "priorities", assignee: "users", status: "statuses" };
  const apiEndpoint = `${BASE_URL}/api/v3/${typeMap[type]}`;

  let response;
  try {
    response = await axios.get(apiEndpoint, { headers });
  } catch (apiErr) {
    const msg = apiErr.response?.data?.message || apiErr.message;
    console.error("API Error (syncMasterData):", msg);
    return { success: false, status: 500, message: `Failed to fetch master data: ${msg}` };
  }

  if (!response.data?._embedded?.elements) {
    return { success: false, status: 400, error: "Invalid API response", message: "API response does not contain expected structure", timestamp: new Date().toISOString() };
  }

  const elements = response.data._embedded.elements;
  const mappedData = elements.map(el => ({ id: el.id, value: el.name }));
  const valueJson = JSON.stringify(mappedData);

  const existing = await dbGet("SELECT id FROM master_data WHERE key = ?", [type]);
  if (existing) {
    await dbRun("UPDATE master_data SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?", [valueJson, type]);
  } else {
    await dbRun("INSERT INTO master_data (key, value) VALUES (?, ?)", [type, valueJson]);
  }

  return { success: true, status: 200, message: `Master data for ${type} updated successfully`, type, count: mappedData.length, data: mappedData, timestamp: new Date().toISOString() };
}

// Sync master data from external API
router.post("/master-data/sync/:type", authenticateToken, async (req, res) => {
  try {
    const result = await syncMasterData(req.params.type);
    res.status(result.status).json(result);
  } catch (error) {
    console.error(`Error updating master data for ${req.params.type}:`, error.message);
    res.status(500).json({ success: false, error: "Failed to update master data", message: error.message, type: req.params.type, timestamp: new Date().toISOString() });
  }
});

// Get master data from database
router.get("/master-data/get/all", authenticateToken, async (req, res) => {
  try {
    const records = await dbAll("SELECT * FROM master_data WHERE key NOT IN ('command', 'template') ORDER BY key ASC");

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
  const records = await dbAll("SELECT * FROM master_data WHERE key NOT IN ('command', 'template') ORDER BY key ASC");
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
  getMasterDataByType,
  createMasterData,
  updateMasterData,
  syncMasterData
};
