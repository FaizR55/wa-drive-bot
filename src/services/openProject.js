const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const { parse } = require("path");

const BASE_URL = process.env.OP_URL;
const TOKEN = process.env.OP_KEY;
const PROJECT = process.env.OP_PROJECT;

const basicAuth = Buffer.from(`apikey:${TOKEN}`).toString('base64');
const headers = {
  Authorization: `Basic ${basicAuth}`,
  Accept: "application/hal+json",
  "Content-Type": "application/json"
};

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function parseIdValue(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (!/^\d+$/.test(String(value).trim())) {
    return null;
  }

  return Number.parseInt(String(value).trim(), 10);
}

function buildTemplateValidationErrors(payload, rawData) {
  const errors = [];

  if (!payload.title) {
    errors.push("Title is required.");
  }

  if (!payload.date) {
    errors.push("Date is required.");
  } else if (!isValidDate(payload.date)) {
    errors.push("Date must use format YYYY-MM-DD.");
  }

  if (!payload.pelapor) {
    errors.push("Pelapor is required.");
  }

  if (!payload.assignee) {
    errors.push("Assignee is required.");
  } else if (parseIdValue(payload.assignee) === null) {
    errors.push("Assignee must be a numeric user-id.");
  }

  if (payload.starttime && !isValidTime(payload.starttime)) {
    errors.push("StartTime must use format HH:mm.");
  }

  if (payload.endtime && !isValidTime(payload.endtime)) {
    errors.push("EndTime must use format HH:mm.");
  }

  if (!rawData.detail || !rawData.detail.trim()) {
    errors.push("Detail is required.");
  } else {
    const trimmedDetail = rawData.detail.trim();
    if (!(trimmedDetail.startsWith('"') && trimmedDetail.endsWith('"'))) {
      errors.push("Detail must start and end with double quotes.");
    }
  }

  ["type", "priority", "location", "process", "category"].forEach((field) => {
    if (payload[field] && parseIdValue(payload[field]) === null) {
      const label = field.charAt(0).toUpperCase() + field.slice(1);
      errors.push(`${label} must be a numeric id.`);
    }
  });

  return errors;
}

function parseTemplate(text) {
  const lines = text.split(/\r?\n/);
  const data = {};
  const rawData = {};

  let lastKey = null;
  let buffer = [];
  let isQuotedDetail = false;

  // Save the current buffered value into data[lastKey]
  function commitBuffer() {
    if (!lastKey) return;

    const rawValue = buffer.join('\n').trim();
    let value = rawValue;

    // Strip surrounding quotes from detail field
    if (lastKey === 'detail' && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    rawData[lastKey] = rawValue;
    data[lastKey] = value;
  }

  for (const line of lines) {
    // When inside a quoted detail block, keep collecting until closing quote
    if (isQuotedDetail) {
      buffer.push(line);
      if (line.endsWith('"')) isQuotedDetail = false;
      continue;
    }

    // Try to match a field key with optional spaces before colon
    // e.g. "Type         : value" or "date: value"
    const match = line.match(/^([a-zA-Z0-9_]+)\s*:\s*(.*)$/);

    if (match) {
      commitBuffer();

      lastKey = match[1].toLowerCase();
      buffer = [match[2]];

      // Start quoted detail mode if value opens with " but doesn't close on same line
      if (lastKey === 'detail' && match[2].startsWith('"') && !match[2].endsWith('"')) {
        isQuotedDetail = true;
      }
    } else if (lastKey) {
      // Continuation line for current field
      buffer.push(line);
    }
  }

  commitBuffer();

  // Build payload dynamically from all parsed fields
  const payload = {};
  for (const [key, value] of Object.entries(data)) {
    payload[key] = typeof value === "string" ? value.trim() : value || '';
  }

  const normalizedPayload = {
    ...payload,
    assignee: parseIdValue(payload.assignee),
    type: parseIdValue(payload.type),
    priority: parseIdValue(payload.priority),
    location: parseIdValue(payload.location),
    process: parseIdValue(payload.process),
    category: parseIdValue(payload.category)
  };

  const errors = buildTemplateValidationErrors(normalizedPayload, rawData);

  return {
    payload: normalizedPayload,
    errors,
    isValid: errors.length === 0
  };
}

async function createWP(payload) {
  try {
    // const { payload } = parseTemplate(text);

    // 1️⃣ CREATE WORK PACKAGE (with payload format)
    const createPayload = {
      subject: payload.title,
      description: {
        format: 'markdown',
        raw: payload.detail || ''
      },
      customField5: payload.pelapor || '',
      // Waktu Laporan
      customField6: payload.date || '',
      _links: {
        type: { href: `/api/v3/types/${payload.type || 8}` },
        priority: { href: `/api/v3/priorities/${payload.priority || 7}` },
        assignee: { href: `/api/v3/users/${payload.assignee}` },
        status: { href: `/api/v3/statuses/12` },
        // Location ID 
        customField3: [
          { href: `/api/v3/custom_options/${payload.location || 2}` }
        ],
        // Process SCX ID
        customField7: { href: `/api/v3/custom_options/${payload.process || 3}` },
        // Kategori Case ID
        customField8: { href: `/api/v3/custom_options/${payload.category || 29}` }
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

    // add spent time
    await axios.post(
      `${BASE_URL}/api/v3/time_entries`,
      {
        hours: "PT5M",
        spentOn: payload.date,
        _links: {
          workPackage: { href: `/api/v3/work_packages/${wpId}` }
        }
      },
      { headers }
    );

    // close and update dates
    await axios.patch(
      `${BASE_URL}/api/v3/work_packages/${wpId}`,
      {
        lockVersion: lockVersion,
        startDate: payload.date,
        dueDate: payload.date,
        ignoreNonWorkingDays: true,
        _links: {
          status: {
            href: `/api/v3/statuses/12`
          }
        }
      },
      { headers }
    );

    return { success: true, wpId: wpId, lockVersion: lockVersion, message: wpUrl };
  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
    return { success: false, message: err.response?.data || err.message };
  }
}

// async function closeWP(wpId, lockVersion) {
//   try {
//     let res;
//     try {
//       res = await axios.patch(
//         `${BASE_URL}/api/v3/work_packages/${wpId}`,
//         {
//           lockVersion: lockVersion,
//           ignoreNonWorkingDays: true,
//           _links: {
//             status: {
//               href: "/api/v3/statuses/12" // closed status id
//             }
//           }
//         },
//         { headers }
//       );
//     } catch (apiErr) {
//       const apiErrorMsg = apiErr.response?.data?.message || apiErr.response?.data || apiErr.message;
//       console.error("API Error (closeWP):", apiErrorMsg);
//       return { success: false, message: `Failed to close work package: ${apiErrorMsg}` };
//     }

//     if (!res.data || !res.data.id) {
//       console.error("API Error (closeWP): Invalid response", res.data);
//       return { success: false, message: "Failed to close work package: Invalid API response." };
//     }

//     console.log("Work Package closed success");

//     return { success: true, message: "Work Package closed successfully.", data: res.data };
//   } catch (err) {
//     console.error("Error:", err.response?.data || err.message);
//     return { success: false, message: err.response?.data || err.message };
//   }
// }

module.exports = {
  createWP,
  // closeWP,
  parseTemplate,
};