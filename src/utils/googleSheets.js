/**
 * Utility functions for Google Sheets API integration.
 * Performs direct client-side requests since Google API supports CORS out of the box.
 */

// Generate the authorization URL for Google OAuth2 Implicit Flow
export const getGoogleAuthUrl = (clientId, redirectUri) => {
  if (!clientId) return '';
  const trimmedClientId = String(clientId).trim();
  const trimmedRedirectUri = String(redirectUri).trim();
  const scopes = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file'
  ];
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${trimmedClientId}&redirect_uri=${encodeURIComponent(trimmedRedirectUri)}&response_type=token&scope=${encodeURIComponent(scopes.join(' '))}&state=google`;
};

// Internal helper to initialize sheet headers
const writeHeaders = async (accessToken, spreadsheetId, headers) => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/운행기록!A1:Q1?valueInputOption=USER_ENTERED`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: '운행기록!A1:Q1',
      majorDimension: 'ROWS',
      values: [headers]
    })
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to write headers: ${response.status} - ${errText}`);
  }
};

// Create a new Google Spreadsheet and write headers
export const createSpreadsheet = async (accessToken, carNumber) => {
  const url = 'https://sheets.googleapis.com/v4/spreadsheets';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: {
        title: `차량 운행기록부 (${carNumber})`
      },
      sheets: [
        {
          properties: {
            title: '운행기록'
          }
        }
      ]
    })
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to create spreadsheet: ${response.status} - ${errText}`);
  }
  
  const data = await response.json();
  const spreadsheetId = data.spreadsheetId;
  
  const headers = [
    '기록 ID', '년도', '월', '일', '부서', '성명', '구분(목적)', '출발분류', '출발지명', '출발지 주소',
    '도착분류', '도착지명', '도착지 주소(경유지 포함)', '주행거리(km)', '비고'
  ];
  
  await writeHeaders(accessToken, spreadsheetId, headers);
  
  return spreadsheetId;
};

// Append a single log entry to the Google Sheet
export const appendLogToSheet = async (accessToken, spreadsheetId, log, settings) => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/운행기록!A1:append?valueInputOption=USER_ENTERED`;
  
  const logDate = new Date(log.date);
  const year = logDate.getFullYear();
  const month = logDate.getMonth() + 1;
  const day = logDate.getDate();
  
  const rowValue = [
    log.id,
    year,
    month,
    day,
    settings.department,
    settings.driverName,
    log.purpose,
    log.depClass,
    log.depName,
    log.depAddr,
    log.destClass,
    log.destName,
    log.visitedPlaces ? `${log.destAddr}(${log.visitedPlaces})` : log.destAddr,
    log.distance,
    log.notes || ''
  ];
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: '운행기록!A1',
      majorDimension: 'ROWS',
      values: [rowValue]
    })
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to append log: ${response.status} - ${errText}`);
  }
  
  return await response.json();
};

// Batch append multiple log entries to the Google Sheet
export const batchSyncLogsToSheet = async (accessToken, spreadsheetId, logs, settings) => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/운행기록!A1:append?valueInputOption=USER_ENTERED`;
  
  // Sort logs by date ascending to keep the sheet records chronological
  const sortedLogs = [...logs].sort((a, b) => new Date(a.date) - new Date(b.date));
  
  const rows = sortedLogs.map(log => {
    const logDate = new Date(log.date);
    const year = logDate.getFullYear();
    const month = logDate.getMonth() + 1;
    const day = logDate.getDate();
    
    return [
      log.id,
      year,
      month,
      day,
      settings.department,
      settings.driverName,
      log.purpose,
      log.depClass,
      log.depName,
      log.depAddr,
      log.destClass,
      log.destName,
      log.visitedPlaces ? `${log.destAddr}(${log.visitedPlaces})` : log.destAddr,
      log.distance,
      log.notes || ''
    ];
  });
  
  if (rows.length === 0) return null;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      range: '운행기록!A1',
      majorDimension: 'ROWS',
      values: rows
    })
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to batch sync logs: ${response.status} - ${errText}`);
  }
  
  return await response.json();
};

// Send logs to Google Sheets via Google Apps Script Web App
export const postToAppsScript = async (scriptUrl, settings, logs) => {
  if (!scriptUrl) throw new Error('Apps Script Web App URL is required');
  const trimmedUrl = String(scriptUrl).trim();
  
  const payload = {
    settings,
    logs: Array.isArray(logs) ? logs : [logs]
  };

  const response = await fetch(trimmedUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Apps Script Request failed: ${response.status} - ${errText}`);
  }

  const result = await response.json();
  if (result.status === 'error') {
    throw new Error(result.message);
  }
  
  return result;
};

// Helper to parse RFC 4180 CSV string to 2D array
const parseCSV = (text) => {
  const lines = [];
  let row = [""];
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        row[row.length - 1] += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push("");
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // Skip \n
      }
      lines.push(row);
      row = [""];
    } else {
      row[row.length - 1] += char;
    }
  }
  if (row.length > 1 || row[0] !== "") {
    lines.push(row);
  }
  return lines;
};

// Fetch raw spreadsheet rows from the schedule sheet (no login required for view-shared sheets)
export const fetchScheduleSheet = async (spreadsheetId, sheetName) => {
  if (!spreadsheetId) throw new Error('구글 스프레드시트 ID가 비어있습니다.');
  if (!sheetName) throw new Error('조회할 시트명이 비어있습니다.');

  const trimmedId = String(spreadsheetId).trim();
  const trimmedSheetName = String(sheetName).trim();
  
  // Fetch as CSV (unaffected by sheet filter/hidden rows)
  const url = `https://docs.google.com/spreadsheets/d/${trimmedId}/export?format=csv&sheet=${encodeURIComponent(trimmedSheetName)}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`시트 조회 실패 (HTTP ${response.status}). 시트 주소 및 공유 권한을 확인해 주세요.`);
  }

  const csvText = await response.text();
  
  try {
    const rows = parseCSV(csvText);
    return rows;
  } catch (e) {
    console.error('Failed to parse CSV:', e);
    throw new Error('공개 일정표 데이터를 파싱하는 데 실패했습니다.');
  }
};
