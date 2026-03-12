const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");

const BASE_URL = process.env.OP_URL;
const TOKEN = process.env.OP_KEY;
const PROJECT = process.env.OP_PROJECT;

const basicAuth = Buffer.from(`apikey:${TOKEN}`).toString('base64');
const headers = {
  Authorization: `Basic ${basicAuth}`,
  Accept: "application/hal+json",
  "Content-Type": "application/json"
};

function extractValue(text) {
  const lines = text.split(/\r?\n/);
  const data = {};
  let lastKey = null;
  let buffer = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (match) {
      if (lastKey) {
        // Join buffer with \n, preserve all whitespace
        data[lastKey] = buffer.join('\n');
      }
      lastKey = match[1].toLowerCase();
      buffer = [match[2]];
    } else if (lastKey) {
      buffer.push(line);
    }
  }
  if (lastKey) {
    data[lastKey] = buffer.join('\n');
  }

  const extracted = data;
  const type = extracted.type || '';
  const title = extracted.title || '';
  const detail = extracted.detail || '';
  const dateField = extracted.date || '';
  const time = extracted.time || '';
  const priority = extracted.priority || '';
  const kategori = extracted.kategori || '';
  const process = extracted.process || '';
  const pelapor = extracted.pelapor || '';
  const location = extracted.location || '';

  return { payload: { type, title, detail, date: dateField, time, priority, kategori, process, pelapor, location } };
}

async function createWP(text) {
  try {
    const { payload } = extractValue(text);

    // 1️⃣ CREATE WORK PACKAGE (new payload format)
    const createPayload = {
      subject: payload.title || 'REQUEST URL',
      description: {
        format: 'markdown',
        raw: payload.detail || ''
      },
      customField5: payload.pelapor || '',
      customField6: payload.date || '',
      _links: {
        type: { href: "/api/v3/types/8" },
        priority: { href: "/api/v3/priorities/7" },
        assignee: { href: "/api/v3/users/20" },
        status: { href: "/api/v3/statuses/12" },
        customField3: [
          { href: "/api/v3/custom_options/2" }
        ],
        customField7: { href: "/api/v3/custom_options/3" },
        customField8: { href: "/api/v3/custom_options/29" }
      }
    };

    let createRes;
    try {
      createRes = await axios.post(
        `${BASE_URL}/api/v3/projects/${PROJECT}/work_packages`,
        createPayload,
        { headers }
      );
    } catch (apiErr) {
      // Axios error: show status and message
      const apiErrorMsg = apiErr.response?.data?.message || apiErr.response?.data || apiErr.message;
      console.error("API Error (createWP):", apiErrorMsg);
      return { success: false, message: `Failed to create work package: ${apiErrorMsg}` };
    }

    if (!createRes.data || !createRes.data.id) {
      console.error("API Error (createWP): Invalid response", createRes.data);
      return { success: false, message: "Failed to create work package: Invalid API response." };
    }

    const wpId = createRes.data.id;
    const lockVersion = createRes.data.lockVersion;
    const wpUrl = `${BASE_URL}/projects/${PROJECT}/work_packages/${wpId}`;

    console.log("created wpId =", wpId);
    console.log("created lockVersion =", lockVersion);

    return { success: true, wpId: wpId, lockVersion: lockVersion, message: wpUrl };
  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
    return { success: false, message: err.response?.data || err.message };
  }
}

async function closeWP(wpId, lockVersion) {
  try {
    let res;
    try {
      res = await axios.patch(
        `${BASE_URL}/api/v3/work_packages/${wpId}`,
        {
          lockVersion: lockVersion,
          _links: {
            status: {
              href: "/api/v3/statuses/12" // closed status id
            }
          }
        },
        { headers }
      );
    } catch (apiErr) {
      const apiErrorMsg = apiErr.response?.data?.message || apiErr.response?.data || apiErr.message;
      console.error("API Error (closeWP):", apiErrorMsg);
      return { success: false, message: `Failed to close work package: ${apiErrorMsg}` };
    }

    if (!res.data || !res.data.id) {
      console.error("API Error (closeWP): Invalid response", res.data);
      return { success: false, message: "Failed to close work package: Invalid API response." };
    }

    console.log("Work Package closed success");

    return { success: true, message: "Work Package closed successfully.", data: res.data };
  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
    return { success: false, message: err.response?.data || err.message };
  }
}

module.exports = {
  createWP,
  closeWP,
};