// ─────────────────────────────────────────────
//  UNIVERSITY LEAD SEGREGATOR
//  Sources: "Payment done Roll no pending" + "Admission Done"
//  Maps by University (col M) → university sheet
//  Groups by month (col F — Admission Date)
//  No duplicates
// ─────────────────────────────────────────────

const SOURCE_SHEETS  = ["Payment done Roll no pending", "Admission Done"];
const UNIVERSITY_COL = 13; // Column M (1-indexed)
const DATE_COL       = 6;  // Column F — Admission Date

const UNIVERSITY_MAP = {
  "DSU":       "DSU adm",
  "VIT":       "VIT ADM",
  "SMU":       "SMU/MUJ",
  "MUJ":       "SMU/MUJ",
  "D Y Patil": "D Y Patil Admission",
};

// ─────────────────────────────────────────────
//  AUTO TRIGGER
// ─────────────────────────────────────────────
function onSheetEdit(e) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = e.source ? e.source.getActiveSheet() : ss.getActiveSheet();

    if (!SOURCE_SHEETS.includes(sheet.getName())) return;

    // Get the last non-empty row that was just edited
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const lastCol = sheet.getLastColumn();
    const rowData = sheet.getRange(lastRow, 1, 1, lastCol).getValues()[0];

    if (!rowData.some(c => c !== "" && c !== null)) return;

    const university      = String(rowData[UNIVERSITY_COL - 1]).trim();
    const targetSheetName = UNIVERSITY_MAP[university];
    if (!targetSheetName) return;

    const monthKey = getMonthKey(rowData[DATE_COL - 1]);
    if (!monthKey) return;

    let targetSheet = ss.getSheetByName(targetSheetName);
    if (!targetSheet) targetSheet = ss.insertSheet(targetSheetName);

    // Check for duplicate — delete old row if found, then write new
    const wasReplaced = findAndDeleteDuplicate(targetSheet, rowData);
    if (wasReplaced) {
      Logger.log(`Duplicate found and removed — writing updated row.`);
    }

    addRowToMonthSection(targetSheet, rowData, monthKey);
    Logger.log(`Last row ${lastRow} from "${sheet.getName()}" → ${targetSheetName} [${monthKey}]`);

  } catch (err) {
    Logger.log(`onSheetEdit error: ${err}`);
  }
}

// ─────────────────────────────────────────────
//  BACKFILL — processes June 2026 from both sheets
//  Remove the month filter after testing
// ─────────────────────────────────────────────
function backfillExistingLeads() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Collect all rows grouped by { targetSheet → { monthKey → [rows] } }
  const grouped = {};

  for (const srcName of SOURCE_SHEETS) {
    const srcSheet = ss.getSheetByName(srcName);
    if (!srcSheet) {
      Logger.log(`"${srcName}" not found — skipping.`);
      continue;
    }

    const lastRow = srcSheet.getLastRow();
    if (lastRow < 2) continue;
    const lastCol = srcSheet.getLastColumn();
    const allData = srcSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    for (let i = 0; i < allData.length; i++) {
      const rowData = allData[i];
      if (!rowData.some(c => c !== "" && c !== null)) continue;

      const university      = String(rowData[UNIVERSITY_COL - 1]).trim();
      const targetSheetName = UNIVERSITY_MAP[university];
      if (!targetSheetName) continue;

      const monthKey = getMonthKey(rowData[DATE_COL - 1]);
      if (!monthKey) continue;

      // ── FILTER: June 2026 only for testing ──
      // Remove this line after testing is confirmed
      if (monthKey.toUpperCase() !== "JUNE 2026") continue;
      // ────────────────────────────────────────

      if (!grouped[targetSheetName]) grouped[targetSheetName] = {};
      if (!grouped[targetSheetName][monthKey]) grouped[targetSheetName][monthKey] = [];

      grouped[targetSheetName][monthKey].push(rowData);
    }
  }

  // Clear and rewrite each university sheet
  let totalProcessed = 0;
  let sheetsUpdated  = 0;

  for (const sheetName in grouped) {
    let targetSheet = ss.getSheetByName(sheetName);
    if (!targetSheet) {
      targetSheet = ss.insertSheet(sheetName);
    } else {
      targetSheet.clearContents();
      targetSheet.clearFormats();
    }

    sheetsUpdated++;
    const months = grouped[sheetName];

    // Sort months chronologically
    const sortedMonths = Object.keys(months).sort((a, b) => monthToDate(a) - monthToDate(b));

    let currentRow = 1;

    for (const monthKey of sortedMonths) {
      const rows = months[monthKey];

      // Deduplicate within this batch by phone+email
      const seenKeys = new Set();
      const unique   = [];
      for (const row of rows) {
        const phone = String(row[PHONE_COL - 1]).trim().replace(/\s/g, "");
        const email = String(row[EMAIL_COL - 1]).trim().toLowerCase();
        const key   = `${phone}|${email}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          unique.push(row);
        } else {
          // Replace with latest (current row is more recent)
          const idx = unique.findIndex(r => {
            const rp = String(r[PHONE_COL - 1]).trim().replace(/\s/g, "");
            const re = String(r[EMAIL_COL - 1]).trim().toLowerCase();
            return rp === phone || re === email;
          });
          if (idx !== -1) unique[idx] = row;
        }
      }

      // Month header
      targetSheet.getRange(currentRow, 1).setValue(monthKey.toUpperCase());
      styleMonthHeader(targetSheet, currentRow, 10);
      currentRow++;

      // Write each row individually using its own column count
      for (const row of unique) {
        const numCols = row.length;
        targetSheet.getRange(currentRow, 1, 1, numCols).setValues([row]);
        currentRow++;
      }

      // Spacing
      currentRow += 2;
      totalProcessed += unique.length;
      Logger.log(`${sheetName} → ${monthKey}: ${unique.length} rows`);
    }
  }

  const msg = `Done!\nSheets updated: ${sheetsUpdated}\nRows written: ${totalProcessed}`;
  Logger.log(msg);
  SpreadsheetApp.getUi().alert(msg);
}

// ─────────────────────────────────────────────
//  ADD SINGLE ROW TO MONTH SECTION (auto trigger)
// ─────────────────────────────────────────────
function addRowToMonthSection(sheet, rowData, monthKey) {
  const lastRow = sheet.getLastRow();
  const numCols = rowData.length;

  // Find month header position
  let monthRowIndex = -1;
  if (lastRow > 0) {
    const col1 = sheet.getRange(1, 1, lastRow, 1).getValues();
    for (let i = 0; i < col1.length; i++) {
      if (String(col1[i][0]).trim().toUpperCase() === monthKey.toUpperCase()) {
        monthRowIndex = i + 1;
        break;
      }
    }
  }

  if (monthRowIndex === -1) {
    // Create new month section at end
    if (lastRow > 0) {
      sheet.insertRowAfter(lastRow);
      sheet.insertRowAfter(lastRow + 1);
    }
    const insertAt = sheet.getLastRow() + 1;
    targetSheet.getRange(insertAt, 1).setValue(monthKey.toUpperCase());
    styleMonthHeader(sheet, insertAt, numCols);
    sheet.getRange(insertAt + 1, 1, 1, numCols).setValues([rowData]);
  } else {
    // Find end of this month's data and insert there
    const col1    = sheet.getRange(1, 1, lastRow, 1).getValues();
    let insertRow = lastRow + 1;
    for (let i = monthRowIndex; i < col1.length; i++) {
      if (isMonthHeader(String(col1[i][0]).trim()) && i + 1 > monthRowIndex) {
        insertRow = i - 1; // before spacing rows of next month
        break;
      }
    }
    sheet.insertRowBefore(insertRow);
    sheet.getRange(insertRow, 1, 1, numCols).setValues([rowData]);
  }
}

// ─────────────────────────────────────────────
//  DUPLICATE CHECK + REPLACE
//  Phone = col J (index 9), Email = col K (index 10)
// ─────────────────────────────────────────────
const PHONE_COL = 10; // Column J (1-indexed)
const EMAIL_COL = 11; // Column K (1-indexed)

function findAndDeleteDuplicate(sheet, rowData) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return false;

  const newPhone = String(rowData[PHONE_COL - 1]).trim().replace(/\s/g, "");
  const newEmail = String(rowData[EMAIL_COL - 1]).trim().toLowerCase();

  if (!newPhone && !newEmail) return false;

  const lastCol    = sheet.getLastColumn();
  const allValues  = sheet.getRange(1, 1, lastRow, lastCol).getValues();

  for (let i = allValues.length - 1; i >= 0; i--) {
    const row        = allValues[i];
    const rowPhone   = String(row[PHONE_COL - 1]).trim().replace(/\s/g, "");
    const rowEmail   = String(row[EMAIL_COL - 1]).trim().toLowerCase();

    const phoneMatch = newPhone && rowPhone && newPhone === rowPhone;
    const emailMatch = newEmail && rowEmail && newEmail === rowEmail;

    if (phoneMatch || emailMatch) {
      // Delete this row
      sheet.deleteRow(i + 1);
      Logger.log(`Deleted duplicate at row ${i + 1} — Phone: ${rowPhone} Email: ${rowEmail}`);
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────
//  STYLING
// ─────────────────────────────────────────────
function styleMonthHeader(sheet, row, numCols) {
  const range = sheet.getRange(row, 1, 1, Math.max(numCols, 1));
  range.setBackground("#2E75B6");
  range.setFontColor("#FFFFFF");
  range.setFontWeight("bold");
  range.setFontSize(12);
  range.setVerticalAlignment("middle");
  sheet.setRowHeight(row, 30);
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function getMonthKey(dateVal) {
  try {
    let d;
    if (dateVal instanceof Date) {
      d = dateVal;
    } else {
      const parts = String(dateVal).split("/");
      if (parts.length === 3) {
        d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      } else {
        d = new Date(dateVal);
      }
    }
    if (isNaN(d.getTime())) return null;
    const months = ["January","February","March","April","May","June",
                    "July","August","September","October","November","December"];
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch(e) {
    return null;
  }
}

function isMonthHeader(val) {
  const months = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE",
                  "JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
  return months.some(m => val.toUpperCase().startsWith(m)) && /\d{4}/.test(val);
}

function monthToDate(monthKey) {
  const months = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];
  const parts = monthKey.split(" ");
  const mIdx  = months.findIndex(m => m.toUpperCase() === parts[0].toUpperCase());
  return new Date(parseInt(parts[1]), mIdx, 1).getTime();
}

// ─────────────────────────────────────────────
//  SETUP TRIGGER — run once manually
// ─────────────────────────────────────────────
function setupTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("onSheetEdit")
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();
  SpreadsheetApp.getUi().alert("Trigger set up successfully!");
}
