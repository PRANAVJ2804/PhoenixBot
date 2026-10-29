// ============================================================
//  PHOENIX LEAD AUTO-ASSIGNMENT  (Google Sheet -> Bitrix24)
//
//  RULES
//  - Runs daily at 6:00 AM IST (trigger installed by LA_setupDailyTrigger).
//  - Only rows with NO background colour are processed.
//  - Responsible Person (Bitrix user ID) BLANK  -> skipped, NOT coloured.
//  - Responsible Person filled                  -> lead goes to exactly that person.
//  - Duplicates / conflicts are NEVER created, EXCEPT the recreate rule below.
//  - RECREATE: if phone AND email match ONE existing lead, that lead is in an eligible
//    stage (RNR, Junk, Counselled and Dropped, Follow Up for Next Session, RNR Lost,
//    Application Drop) AND its owner is listed in the 'Team' sheet -> the old lead is
//    backed up ('Recreation Backup' sheet), deleted and recreated as a Fresh lead.
//  - 50 leads created per chunk, then a 10 minute pause, then the next chunk.
//  - Progress lives in the sheet colours, so a crash resumes automatically.
//  - One summary email at the end (counts only, no customer data).
//
//  COLOURS
//    green  #b6d7a8  assigned (new lead)
//    blue   #aedff7  recreated (old lead replaced)
//    orange #f9cb9c  duplicate - not touched
//    yellow #ffe599  conflict  (only phone OR only email matches) - not assigned
//    red    #ea9999  bad data  (invalid phone/email/ID/stage) - not assigned
//  To retry a red/orange/yellow row: fix it and clear its colour.
// ============================================================

const LA = {
  WEBHOOK: "https://phoenix.bitrix24.in/rest/110/token/",
  SHEET: "Leads",
  EMAILS: ["jagadeeshapranav@gmail.com"],   // add more addresses here
  TZ: "Asia/Kolkata",
  STATUS_HEADER: "Sync Status",
  DEFAULT_STAGE_NAMES: ["Fresh", "Fresh Lead", "Fresh Leads"],   // used when the sheet has no Stage column / blank Stage
  DEFAULT_SCORE: "0",             // used when the sheet has no Lead Score column / blank cell
  DEFAULT_SOURCE: "Phoenix",      // used when the sheet has no Source column / blank cell (Phoenix = CALL)
  DAILY_HOUR: 5,                  // daily run time (IST, 24h clock)
  TEAM_SHEET: "Team",             // sheet with columns: Name | Bitrix ID  (owners whose old leads may be recreated)
  BACKUP_SHEET: "Recreation Backup",

  CHUNK_CREATE_LIMIT: 50,         // leads created per chunk
  PAUSE_MIN: 10,                  // minutes to wait between chunks
  TIME_BUDGET_MS: 240000,         // stop a run at 4 min (Google kills at 6)
  LOCK_TTL_MS: 25 * 60 * 1000,    // run considered dead if no heartbeat for 25 min
  MAX_RETRIES: 5,                 // consecutive failed/stalled chunks before giving up
  CHECK_BATCH: 25,                // leads per duplicate-check batch (2 calls each, max 50)
  CREATE_BATCH: 50,               // leads per create batch
  SLEEP_MS: 600,                  // gap between API calls (Bitrix ~2 req/sec)

  COLORS: { assigned: "#b6d7a8", recreated: "#aedff7", duplicate: "#f9cb9c", conflict: "#ffe599", error: "#ea9999" }
};

// Stages from which an old lead may be deleted and recreated as Fresh (stage ID -> label)
const LA_ELIGIBLE_STAGES = { "4": "RNR", "JUNK": "Junk Lead", "11": "Counselled and Dropped",
                             "7": "Follow Up for Next Session", "12": "RNR Lost", "13": "Application Drop" };

const LA_STAGE_NAMES = { "NEW": "Fresh Lead", "4": "RNR", "IN_PROCESS": "Cold", "1": "Warm", "2": "Hot",
                         "CONVERTED": "Admission Completed", "JUNK": "Junk Lead", "11": "Counselled and Dropped",
                         "7": "Follow Up for Next Session", "12": "RNR Lost", "13": "Application Drop" };

// Custom fields blanked on every recreated lead (same list as the recreate script)
const LA_BLANK_UF = [
  "UF_CRM_1769692224", "UF_CRM_1769691364", "UF_CRM_1769563220", "UF_CRM_1769692079", "UF_CRM_1769691809",
  "UF_CRM_1770037468", "UF_CRM_1770793944", "UF_CRM_1770794403", "UF_CRM_1770794059", "UF_CRM_1770794177",
  "UF_CRM_1769992866", "UF_CRM_1769952210091", "UF_CRM_1769563348", "UF_CRM_1769692291", "UF_CRM_1771397395",
  "UF_CRM_1770462514", "UF_CRM_1771751550", "UF_CRM_1769999883", "UF_CRM_1770792570", "UF_CRM_1770451940",
  "UF_CRM_1770540852", "UF_CRM_1771002114", "UF_CRM_1771325296", "UF_CRM_1771374767292", "UF_CRM_1771396638",
  "UF_CRM_1771465140", "UF_CRM_1771563765", "UF_CRM_1771809078097", "UF_CRM_1771809115498", "UF_CRM_1771914096",
  "UF_CRM_1771946837", "UF_CRM_1771955544", "UF_CRM_1772070129753", "UF_CRM_1772705136", "UF_CRM_1773060188236",
  "UF_CRM_1773060656870", "UF_CRM_1773112947876", "UF_CRM_1773388536186", "UF_CRM_1773492964", "UF_CRM_1773918794483",
  "UF_CRM_1774024272", "UF_CRM_1774026535", "UF_CRM_1775558656810", "UF_CRM_VALIDATION", "UF_CRM_DATE_CHANGED",
  "UF_CRM_PREVIOUS_EDUCATION", "UF_CRM_PREVIOUS_DESIGNATION", "UF_CRM_PREVIOUS_COUNSELLED",
  "UF_CRM_PREVIOUSLEAD_ASSIGNED_DATE__TIME", "UF_CRM_1771002088", "UF_CRM_1770718242", "UF_CRM_1771678998",
  "UF_CRM_1771679057", "UF_CRM_1771335019", "UF_CRM_1769961275", "UF_CRM_1771397185", "UF_CRM_1771476235",
  "UF_CRM_1771678898", "UF_CRM_1771678918", "UF_CRM_1771678950", "UF_CRM_1771678973", "UF_CRM_1771679024",
  "UF_CRM_1771679085", "UF_CRM_1771762755", "UF_CRM_1771762797"
];

const LA_TRANSIENT = ["QUERY_LIMIT_EXCEEDED", "OPERATION_TIME_LIMIT", "INTERNAL_SERVER_ERROR",
                      "ERROR_UNEXPECTED", "NETWORK", "TOO_MANY_REQUESTS", "BACKEND_TIMEOUT"];

const LA_SUB_SOURCE = (function () {
  const raw = {
    "p1": 1686, "p2": 1688, "p3": 1690, "p4": 1692, "p5": 1694, "p6": 1696,
    "p7": 1698, "p8": 1700, "p9": 1702, "p10": 1704,
    "p_ien(vit)": 1746, "p_ien(btech)": 1752, "s_ien": 1760,
    "p_rnr": 5032, "p_sp": 5038, "prashanth prospect": 5060, "p_wdr": 5066,
    "p_dsu": 5154, "p_opj": 5156, "p_iel": 5190, "p_a": 5202, "bitrix24 enquiry": 5196
  };
  return raw;
})();

const LA_SOURCE = {
  "phoenix": "CALL", "navasethu": "WEBFORM", "upgrad leads": "CALLBACK",
  "churn up data": "RC_GENERATOR", "website": "STORE", "reference": "BOOKING",
  "marketing": "REPEAT_SALE", "bitrix24": "UC_D1BPGU", "phoenix web organic": "UC_Z3G4IC"
};


// ─── MENU / TRIGGER SETUP ────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi().createMenu("🚀 Lead Assignment")
    .addItem("▶ Assign leads now (manual run)", "LA_manualRun")
    .addSeparator()
    .addItem("⏰ Install 5 AM daily trigger", "LA_setupDailyTrigger")
    .addItem("🛑 Remove daily trigger", "LA_removeDailyTrigger")
    .addSeparator()
    .addItem("📊 Check status", "LA_status")
    .addItem("✉️ Send test email", "LA_testEmail")
    .addItem("🧪 Test run (visible – shows errors)", "LA_debugRun")
    .addSeparator()
    .addItem("🔁 Reset stuck run", "LA_reset")
    .addToUi();
}

function LA_manualRun() {
  const st = LA_loadState();
  if (st && (Date.now() - st.heartbeat) < LA.LOCK_TTL_MS) {
    LA_alert("⚠️ A run is already in progress (chunk " + st.chunks + ", " + st.assigned + " assigned so far).\n\nIt is probably waiting out the " + LA.PAUSE_MIN + " min pause between chunks. If you believe it is stuck, use 🔁 Reset stuck run and try again.");
    return;
  }

  // Preflight: tell the user exactly why nothing would happen, instead of failing silently.
  const problem = LA_preflight();
  if (problem) { LA_alert(problem); return; }

  if (LA_startRun(true)) {
    LA_alert("▶ Started in the background.\n\nYou can close this sheet. The leads are assigned in chunks of " + LA.CHUNK_CREATE_LIMIT +
      " with a " + LA.PAUSE_MIN + " min pause between chunks, and nothing here will show as 'running'.\n\nThe first chunk begins within about a minute. A summary email goes to " +
      LA.EMAILS.join(", ") + " when everything is done.");
  }
}

// Returns a problem description (string) or "" if everything is OK to start.
function LA_preflight() {
  if (/\/token\/?$/.test(LA.WEBHOOK) || LA.WEBHOOK.indexOf("token") > -1 && LA.WEBHOOK.split("/").filter(Boolean).pop() === "token") {
    return "❌ The WEBHOOK in the script is still the placeholder ('.../rest/110/token/').\n\nReplace it with your real Bitrix24 inbound webhook URL (LA.WEBHOOK at the top of the script) and save.";
  }

  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LA.SHEET);
  if (!sh) return "❌ No sheet named '" + LA.SHEET + "' in this spreadsheet.";

  let ctx;
  try { ctx = LA_readSheet(sh); } catch (e) { return "❌ " + e.message; }

  if (!ctx.eligible.length) {
    return "ℹ️ Nothing to assign – no row is ready.\n\n" +
      "Rows ready (no colour + Responsible Person filled): 0\n" +
      "Rows skipped because Responsible Person is blank: " + (ctx.skippedBlank || 0) + "\n" +
      "Rows skipped because they already have a background colour: " + (ctx.coloredRows || 0) + "\n\n" +
      "If you just pasted leads, check that (1) column 'Responsible Person' has the Bitrix ID, and (2) the pasted rows have no fill colour.";
  }

  const probe = LA_api("user.get", { FILTER: { ACTIVE: true } }, 2);
  if (!probe || probe.error || !probe.result) {
    return "❌ Bitrix24 API call failed:\n" + (probe ? (probe.error_description || probe.error) : "no response") +
      "\n\nCheck the WEBHOOK URL/token and that the webhook has CRM and Users (user) permissions.";
  }

  try {
    const stages = LA_fetchStages();
    if (!LA_defaultStage(stages)) {
      return "❌ No 'Fresh' stage was found in Bitrix24 lead stages (looked for: " + LA.DEFAULT_STAGE_NAMES.join(", ") + ").\n\nAvailable stages: " + Object.keys(stages.byName).join(", ") + "\n\nAdd the exact stage name to DEFAULT_STAGE_NAMES at the top of the script.";
    }
  } catch (e) { return "❌ " + e.message; }

  return "";
}

function LA_setupDailyTrigger() {
  LA_clearTriggers("LA_dailyKickoff");
  ScriptApp.newTrigger("LA_dailyKickoff")
    .timeBased().everyDays(1).atHour(LA.DAILY_HOUR).nearMinute(0).inTimezone(LA.TZ).create();
  LA_alert("✅ Daily trigger installed.\n\nLeads will be assigned every day at about " + LA.DAILY_HOUR + " AM IST (it can fire up to ~15 min late). A summary email goes to:\n" + LA.EMAILS.join(", "));
}

function LA_removeDailyTrigger() {
  const had = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === "LA_dailyKickoff"; });
  LA_clearTriggers("LA_dailyKickoff");
  LA_alert(had ? "🛑 Daily trigger removed. Nothing will run automatically until you install it again." : "No daily trigger was installed.");
}

function LA_status() {
  const triggers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  const daily = triggers.indexOf("LA_dailyKickoff") > -1;
  const st = LA_loadState();
  const running = st && (Date.now() - st.heartbeat) < LA.LOCK_TTL_MS;

  let line = "";
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LA.SHEET);
  if (!sh) {
    line = "❌ Sheet '" + LA.SHEET + "' not found.";
  } else {
    try {
      const ctx = LA_readSheet(sh);
      const bgs = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getBackgrounds() : [];
      const n = { green: 0, blue: 0, orange: 0, yellow: 0, red: 0 };
      bgs.forEach(function (r) {
        const c = String(r[0]).toLowerCase();
        if (c === LA.COLORS.assigned) n.green++;
        else if (c === LA.COLORS.recreated) n.blue++;
        else if (c === LA.COLORS.duplicate) n.orange++;
        else if (c === LA.COLORS.conflict) n.yellow++;
        else if (c === LA.COLORS.error) n.red++;
      });
      const teamCount = Object.keys(LA_readTeam()).length;
      line = "Team sheet: " + (teamCount ? teamCount + " members (recreate ON)" : "not found / empty (recreate OFF)") +
             "\nPending (will be assigned): " + ctx.eligible.length +
             "\nSkipped – Responsible Person blank: " + ctx.skippedBlank +
             "\n\nAlready processed:\n 🟢 Assigned: " + n.green + "\n 🔵 Recreated: " + n.blue + "\n 🟠 Duplicate: " + n.orange +
             "\n 🟡 Conflict: " + n.yellow + "\n 🔴 Bad data: " + n.red;
    } catch (e) {
      line = "❌ " + e.message;
    }
  }

  LA_alert("📊 STATUS\n\n" +
    "Daily " + LA.DAILY_HOUR + " AM trigger: " + (daily ? "✅ installed" : "❌ NOT installed") + "\n" +
    "Run in progress: " + (running ? "▶ yes (chunk " + st.chunks + ", assigned so far " + st.assigned + ")" : "no") + "\n" +
    "Email goes to: " + LA.EMAILS.join(", ") + "\n" +
    (st && st.lastError ? "Last error: " + st.lastError + "\n" : "") + "\n" + line);
}

function LA_testEmail() {
  LA_email(LA_newState(), "done", "🧪 This is a TEST email. If you can read it, the daily summary will reach you.");
  LA_alert("✉️ Test email sent to:\n" + LA.EMAILS.join(", "));
}

// Diagnostic: works ONE chunk right here (max ~90 s) and shows the result or the exact error.
// Real leads are assigned exactly as in a normal run. No emails, no background trigger.
function LA_debugRun() {
  const old = LA_loadState();
  if (old && (Date.now() - old.heartbeat) < LA.LOCK_TTL_MS) {
    LA_alert("A background run is active. Use 🔁 Reset stuck run first, then try again.");
    return;
  }
  const problem = LA_preflight();
  if (problem) { LA_alert(problem); return; }

  const st = LA_newState();
  st.chunks = 1;
  try {
    const r = LA_work(st, Date.now() + 90000);
    LA_alert("🧪 Test chunk finished.\n\nAssigned (new): " + st.assigned + "\nRecreated: " + st.recreated + "\nDuplicates: " + st.duplicates + "\nConflicts: " + st.conflicts +
      "\nBad data: " + st.errors + "\nStill pending: " + Math.max(0, r.remaining) +
      (r.remaining > 0 ? "\n\nClick ▶ Assign leads now to process the rest in the background." : ""));
  } catch (e) {
    LA_alert("❌ ERROR:\n" + (e && e.message || e) + "\n\n" + String(e && e.stack || "").slice(0, 600));
  } finally {
    LA_clearState();
  }
}

// Appends a line to a 'Run Log' sheet so you can see what the background job did.
function LA_log(msg) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName("Run Log") || ss.insertSheet("Run Log");
    if (sh.getLastRow() === 0) sh.appendRow(["Time (IST)", "Event"]);
    sh.appendRow([Utilities.formatDate(new Date(), LA.TZ, "dd MMM yyyy HH:mm:ss"), msg]);
  } catch (e) {}
}

function LA_reset() {
  LA_clearTriggers("LA_continue");
  LA_clearState();
  LA_alert("✅ Run state cleared. You can start a new run.");
}

function LA_alert(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { LA_toast(msg); }
}


// ─── ENTRY POINTS ────────────────────────────────────────────────────────────

function LA_newState() {
  return { heartbeat: Date.now(), startedAt: Date.now(), retries: 0, chunks: 0,
           assigned: 0, recreated: 0, recreatedByStage: {}, duplicates: 0, conflicts: 0, errors: 0,
           skippedBlank: 0, perPerson: {} };
}

// Called by the daily time trigger (already headless, so it works the first chunk directly).
function LA_dailyKickoff() { LA_startRun(false); }

// background=true  -> (menu click) only creates the run and schedules it as a background trigger, then returns immediately.
// background=false -> (time trigger) works the first chunk right away.
function LA_startRun(background) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { LA_toast("Another run is in progress."); return false; }
  try {
    const old = LA_loadState();
    if (old && (Date.now() - old.heartbeat) < LA.LOCK_TTL_MS) {
      LA_toast("A run is already in progress (paused between chunks).");
      return false;
    }
    if (old) {   // dead run left behind - report it and start clean
      LA_email(old, "failed", "A previous run stopped without finishing. Starting a fresh run.");
    }
    LA_clearTriggers("LA_continue");
    LA_saveState(LA_newState());
  } finally {
    lock.releaseLock();
  }
  if (background) {
    try {
      LA_schedule(5000);   // fires in the background within ~a minute; the sheet is free immediately
    } catch (e) {
      LA_clearState();
      LA_alert("❌ Could not schedule the background job: " + e.message);
      return false;
    }
    return true;
  }
  LA_processChunk();
  return true;
}

function LA_continue() { LA_processChunk(); }


// ─── CHUNK CONTROLLER ────────────────────────────────────────────────────────

function LA_processChunk() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  let st = null;
  try {
    LA_clearTriggers("LA_continue");
    st = LA_loadState();
    if (!st) return;
    st.chunks++;
    st.heartbeat = Date.now();
    LA_saveState(st);
    LA_log("Chunk " + st.chunks + " started");

    const deadline = Date.now() + LA.TIME_BUDGET_MS;
    let r;
    try {
      r = LA_work(st, deadline);
      st.retries = r.progress > 0 ? 0 : st.retries + 1;
      LA_log("Chunk " + st.chunks + " done. Handled: " + r.progress + ", remaining: " + r.remaining + ", assigned so far: " + st.assigned);
    } catch (e) {
      LA_log("ERROR in chunk " + st.chunks + ": " + (e && e.message || e));
      if (e && e.noRetry) { LA_finish(st, "failed", e.message); return; }
      st.retries++;
      st.lastError = String(e && e.message || e);
      if (st.retries === 1) {   // tell the owner immediately, don't wait for 5 failures
        try {
          MailApp.sendEmail({ to: LA.EMAILS.join(","), subject: "⚠️ Lead Assignment hit an error (retrying in " + LA.PAUSE_MIN + " min)",
            body: "Error: " + st.lastError + "\n\nAssigned so far: " + st.assigned + ". It will retry automatically." });
        } catch (x) {}
      }
      r = { remaining: 1, progress: 0, hitCap: false, crashed: true };
    }

    if (r.remaining <= 0) { LA_finish(st, "done"); return; }
    if (st.retries > LA.MAX_RETRIES) {
      LA_finish(st, "failed", "Stopped after repeated failures. " + (st.lastError ? "Last error: " + st.lastError : "Rows could not be processed (API errors)."));
      return;
    }

    st.heartbeat = Date.now();
    LA_saveState(st);
    const delay = (r.hitCap || r.crashed || r.progress === 0) ? LA.PAUSE_MIN * 60000 : 60000;
    LA_schedule(delay);
  } catch (e) {
    try { if (st) LA_finish(st, "failed", "Unexpected error: " + (e.message || e)); } catch (x) {}
  } finally {
    lock.releaseLock();
  }
}

function LA_finish(st, mode, reason) {
  LA_clearTriggers("LA_continue");
  try { LA_email(st, mode, reason); } catch (e) {}
  LA_clearState();
}


// ─── THE ACTUAL WORK (ONE CHUNK) ─────────────────────────────────────────────

function LA_work(st, deadline) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LA.SHEET);
  if (!sh) { const e = new Error("Sheet '" + LA.SHEET + "' not found"); e.noRetry = true; throw e; }

  const ctx = LA_readSheet(sh);
  st.skippedBlank = ctx.skippedBlank;
  if (!ctx.eligible.length) return { remaining: 0, progress: 0, hitCap: false };

  const users  = LA_fetchUsers();
  const stages = LA_fetchStages();
  const defaultStage = LA_defaultStage(stages);
  if (!defaultStage) {
    const e = new Error("No default 'Fresh' stage found in Bitrix lead statuses. Available: " + Object.keys(stages.byName).join(", ")); e.noRetry = true; throw e;
  }

  const team = LA_readTeam();   // owners whose old leads may be recreated: { bitrixId: name }
  const recreateOn = Object.keys(team).length > 0;
  if (!recreateOn) LA_log("Team sheet missing or empty - recreate is OFF, duplicates are left untouched");

  let created = 0, handled = 0;
  const seen = {};   // in-sheet duplicate guard: phone/email -> first row number seen this chunk
  const el = ctx.eligible;

  for (let g = 0; g < el.length; g += LA.CHECK_BATCH) {
    if (created >= LA.CHUNK_CREATE_LIMIT) break;
    if (Date.now() > deadline) break;

    const group = el.slice(g, g + LA.CHECK_BATCH);
    const outcomes = [];
    const cands = [];

    // 1) local validation
    group.forEach(function (i) {
      const row = ctx.vals[i], rowNum = i + 1;
      const err = function (t) { outcomes.push({ rowNum: rowNum, type: "error", color: LA.COLORS.error, text: "Error – " + t }); };

      const name  = String(row[ctx.iName] || "").trim();
      const phone = LA_phone(row[ctx.iPhone]);
      const email = ctx.iEmail > -1 ? String(row[ctx.iEmail] || "").trim().toLowerCase() : "";
      const rpRaw = String(row[ctx.iRP]).trim();

      if (!name) return err("Missing lead name");
      if (phone.length !== 10) return err("Invalid phone number");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err("Invalid email");
      if (!/^\d+$/.test(rpRaw)) return err("Responsible Person must be a Bitrix user ID (number)");
      const rpId = parseInt(rpRaw, 10);
      if (!users[rpId]) return err("Bitrix ID " + rpId + " is not an active user");

      const stageVal = ctx.iStage > -1 ? String(row[ctx.iStage] || "").trim() : "";
      const stageId = stageVal ? LA_stageId(stages, stageVal) : defaultStage;
      if (!stageId) return err("Stage '" + stageVal + "' not found in Bitrix");

      const kP = "p" + phone, kE = email ? "e" + email : null;
      const prior = seen[kP] || (kE && seen[kE]);
      if (prior) {
        outcomes.push({ rowNum: rowNum, type: "duplicate", color: LA.COLORS.duplicate,
          text: "Duplicate – same phone/email as row " + prior + " in this sheet" });
        return;
      }
      seen[kP] = rowNum; if (kE) seen[kE] = rowNum;
      cands.push({ i: i, rowNum: rowNum, row: row, name: name, phone: phone, email: email, rpId: rpId, stageId: stageId });
    });

    // 2) duplicate check against Bitrix (leads + contacts + companies)
    const creatables = [];
    const recreateCands = [];   // phone AND email hit one single lead -> maybe recreate
    if (cands.length) {
      const cmd = {};
      cands.forEach(function (c, k) {
        cmd["p" + k] = "crm.duplicate.findbycomm?" + LA_q({ type: "PHONE", values: [c.phone, "91" + c.phone, "+91" + c.phone] });
        if (c.email) cmd["e" + k] = "crm.duplicate.findbycomm?" + LA_q({ type: "EMAIL", values: [c.email] });
      });
      const br = LA_batch(cmd, 4);
      if (br) {
        cands.forEach(function (c, k) {
          const pr = br.result["p" + k], pe = br.errors["p" + k];
          const er = c.email ? br.result["e" + k] : [];
          const ee = c.email ? br.errors["e" + k] : null;
          // any doubt about the check -> do NOT create; leave uncoloured for the next chunk
          if (pe || ee || pr === undefined || (c.email && er === undefined)) return;

          const ph = LA_hits(pr), em = LA_hits(er);
          const phKeys = Object.keys(ph), emKeys = Object.keys(em);
          if (!phKeys.length && !emKeys.length) { creatables.push(c); return; }

          const common = phKeys.filter(function (x) { return em[x]; });
          const isDup = phKeys.length && (!c.email || common.length);
          if (isDup) {
            const union = Object.keys(Object.assign({}, ph, em));
            if (recreateOn && c.email && common.length && union.length === 1 && union[0].indexOf("LEAD #") === 0) {
              recreateCands.push({ c: c, key: union[0], leadId: union[0].replace("LEAD #", "") });
              return;
            }
            outcomes.push({ rowNum: c.rowNum, type: "duplicate", color: LA.COLORS.duplicate,
              text: "Duplicate – existing " + (common[0] || phKeys[0]) });
          } else {
            const what = (phKeys.length ? "phone " + phKeys[0] : "") + (phKeys.length && emKeys.length ? " / " : "") + (emKeys.length ? "email " + emKeys[0] : "");
            outcomes.push({ rowNum: c.rowNum, type: "conflict", color: LA.COLORS.conflict,
              text: "Conflict – " + what + " already exists. Not assigned." });
          }
        });
      }
    }

    // 2b) for recreate candidates: read the old lead and decide (stage + owner + exact phone/email)
    const recreations = [];
    if (recreateCands.length) {
      const gcmd = {};
      recreateCands.forEach(function (rc, k) { gcmd["g" + k] = "crm.lead.get?id=" + encodeURIComponent(rc.leadId); });
      const gr = LA_batch(gcmd, 4);
      if (gr) {   // if the read failed, rows stay uncoloured and are retried next chunk
        recreateCands.forEach(function (rc, k) {
          const lead = gr.result["g" + k], ge = gr.errors["g" + k];
          if (ge || !lead) {
            if (ge && !LA_isTransient(ge)) {
              outcomes.push({ rowNum: rc.c.rowNum, type: "duplicate", color: LA.COLORS.duplicate,
                text: "Duplicate – existing " + rc.key + " (could not read it)" });
            }
            return;
          }
          const stage = String(lead.STATUS_ID || "").trim();
          const owner = parseInt(lead.ASSIGNED_BY_ID, 10);
          const phoneOk = (lead.PHONE || []).some(function (p) { return LA_phone(p.VALUE) === rc.c.phone; });
          const emailOk = (lead.EMAIL || []).some(function (e) { return String(e.VALUE || "").toLowerCase().trim() === rc.c.email; });

          if (phoneOk && emailOk && LA_ELIGIBLE_STAGES[stage] && team[owner]) {
            recreations.push({ c: rc.c, lead: lead, stage: stage, label: LA_ELIGIBLE_STAGES[stage] });
          } else {
            const why = !(phoneOk && emailOk) ? "phone/email not an exact match"
                      : (!LA_ELIGIBLE_STAGES[stage] ? "stage: " + (LA_STAGE_NAMES[stage] || stage) : "owner not in Team sheet");
            outcomes.push({ rowNum: rc.c.rowNum, type: "duplicate", color: LA.COLORS.duplicate,
              text: "Duplicate – existing " + rc.key + " (" + why + ")" });
          }
        });
      }
    }

    // 3) create in Bitrix (single attempt - never blindly retry a create)
    const toCreate = creatables.slice(0, LA.CHUNK_CREATE_LIMIT - created);
    for (let s = 0; s < toCreate.length; s += LA.CREATE_BATCH) {
      const part = toCreate.slice(s, s + LA.CREATE_BATCH);
      const cmd = {};
      part.forEach(function (c, k) { cmd["a" + k] = "crm.lead.add?" + LA_q({ fields: LA_fields(c, ctx) }); });
      const br = LA_batch(cmd, 1);
      if (!br) continue;

      const remarks = {};
      part.forEach(function (c, k) {
        const id = br.result["a" + k], er = br.errors["a" + k];
        if (id && !er) {
          created++;
          outcomes.push({ rowNum: c.rowNum, type: "assigned", color: LA.COLORS.assigned,
            text: "Assigned – Lead #" + id + " → " + users[c.rpId], personId: c.rpId, personName: users[c.rpId] });
          const remark = ctx.iRemarks > -1 ? String(c.row[ctx.iRemarks] || "").trim() : "";
          if (remark) remarks["r" + k] = "crm.timeline.comment.add?" + LA_q({ fields: { ENTITY_ID: id, ENTITY_TYPE: "lead", COMMENT: remark } });
        } else if (er && !LA_isTransient(er)) {
          outcomes.push({ rowNum: c.rowNum, type: "error", color: LA.COLORS.error,
            text: "Error – Bitrix rejected: " + LA_errMsg(er) });
        }
      });
      if (Object.keys(remarks).length) LA_batch(remarks, 1);   // best effort
    }

    // 3b) recreate: backup -> delete -> create (counts toward the chunk limit)
    const toRecreate = recreations.slice(0, Math.max(0, LA.CHUNK_CREATE_LIMIT - created));
    for (let s = 0; s < toRecreate.length; s += LA.CREATE_BATCH) {
      const part = toRecreate.slice(s, s + LA.CREATE_BATCH);
      if (!LA_backup(part)) continue;   // no backup saved -> never delete anything

      const dcmd = {};
      part.forEach(function (x, k) { dcmd["d" + k] = "crm.lead.delete?id=" + encodeURIComponent(x.lead.ID); });
      const dr = LA_batch(dcmd, 1);
      if (!dr) continue;

      const deleted = [];
      part.forEach(function (x, k) {
        const er = dr.errors["d" + k];
        if (dr.result["d" + k] === true && !er) deleted.push(x);
        else if (er && !LA_isTransient(er)) {
          outcomes.push({ rowNum: x.c.rowNum, type: "error", color: LA.COLORS.error,
            text: "Error – could not delete old LEAD #" + x.lead.ID + ": " + LA_errMsg(er) + " (not recreated)" });
        }
      });
      if (!deleted.length) continue;

      const ccmd = {};
      deleted.forEach(function (x, k) { ccmd["n" + k] = "crm.lead.add?" + LA_q({ fields: LA_recreateFields(x, defaultStage, ctx) }); });
      const cr = LA_batch(ccmd, 1);
      // if this call failed, the rows stay uncoloured: the old lead is gone, so the next chunk simply creates them as normal Fresh leads
      if (!cr) continue;

      const rremarks = {};
      deleted.forEach(function (x, k) {
        const id = cr.result["n" + k], er = cr.errors["n" + k];
        if (id && !er) {
          created++;
          outcomes.push({ rowNum: x.c.rowNum, type: "recreated", color: LA.COLORS.recreated,
            text: "Recreated – replaced LEAD #" + x.lead.ID + " (" + x.label + ") with LEAD #" + id + " → " + users[x.c.rpId],
            personId: x.c.rpId, personName: users[x.c.rpId], label: x.label });
          const remark = ctx.iRemarks > -1 ? String(x.c.row[ctx.iRemarks] || "").trim() : "";
          if (remark) rremarks["r" + k] = "crm.timeline.comment.add?" + LA_q({ fields: { ENTITY_ID: id, ENTITY_TYPE: "lead", COMMENT: remark } });
        } else if (er && !LA_isTransient(er)) {
          outcomes.push({ rowNum: x.c.rowNum, type: "error", color: LA.COLORS.error,
            text: "Error – old LEAD #" + x.lead.ID + " deleted but create failed: " + LA_errMsg(er) + ". Old data is in '" + LA.BACKUP_SHEET + "'." });
        }
      });
      if (Object.keys(rremarks).length) LA_batch(rremarks, 1);   // best effort
    }

    // 4) persist immediately: sheet colours first, then run stats
    LA_write(sh, ctx, outcomes);
    outcomes.forEach(function (o) {
      if (o.type === "assigned") {
        st.assigned++;
        const p = st.perPerson[o.personId] || (st.perPerson[o.personId] = { name: o.personName, count: 0, recreated: 0 });
        p.count++;
      } else if (o.type === "recreated") {
        st.recreated = (st.recreated || 0) + 1;
        st.recreatedByStage = st.recreatedByStage || {};
        st.recreatedByStage[o.label] = (st.recreatedByStage[o.label] || 0) + 1;
        const p = st.perPerson[o.personId] || (st.perPerson[o.personId] = { name: o.personName, count: 0, recreated: 0 });
        p.recreated = (p.recreated || 0) + 1;
      } else if (o.type === "duplicate") st.duplicates++;
      else if (o.type === "conflict") st.conflicts++;
      else st.errors++;
    });
    handled += outcomes.length;
    st.heartbeat = Date.now();
    LA_saveState(st);
  }

  return { remaining: el.length - handled, progress: handled, hitCap: created >= LA.CHUNK_CREATE_LIMIT };
}


// ─── SHEET HELPERS ───────────────────────────────────────────────────────────

function LA_readSheet(sh) {
  let lastCol = sh.getLastColumn();
  const lastRow = sh.getLastRow();
  if (lastRow < 2 || lastCol < 1) return { eligible: [], skippedBlank: 0 };

  const header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  let statusIdx = header.indexOf(LA.STATUS_HEADER);
  if (statusIdx === -1) {
    sh.getRange(1, lastCol + 1).setValue(LA.STATUS_HEADER);
    SpreadsheetApp.flush();
    header.push(LA.STATUS_HEADER);
    statusIdx = lastCol;
    lastCol++;
  }

  const range = sh.getRange(1, 1, lastRow, lastCol);
  const vals = range.getValues();
  const bgs = range.getBackgrounds();

  const idx = function (n) { return header.indexOf(n); };
  const ctx = {
    vals: vals, header: header, statusCol: statusIdx + 1, lastColLetter: LA_col(lastCol),
    iName: idx("Lead Name"), iPhone: idx("Work Phone"), iEmail: idx("Work E-mail"),
    iRP: idx("Responsible Person"), iStage: idx("Stage"), iCity: idx("City"),
    iDesig: idx("Designation"), iEdu: idx("Education"), iScore: idx("Lead Score"),
    iSource: idx("Source"), iSub: idx("Sub Source (Admin)"), iPrev: idx("Previous Assigned Counsellor"),
    iProg: idx("Program"), iRemarks: idx("Remarks (comment)"),
    eligible: [], skippedBlank: 0, coloredRows: 0
  };
  if (ctx.iName < 0 || ctx.iPhone < 0 || ctx.iRP < 0) {
    const e = new Error("Missing required column(s): Lead Name / Work Phone / Responsible Person");
    e.noRetry = true; throw e;
  }

  for (let i = 1; i < vals.length; i++) {
    const row = vals[i];
    const hasLead = String(row[ctx.iName] || "").trim() || String(row[ctx.iPhone] || "").trim() ||
                    (ctx.iEmail > -1 && String(row[ctx.iEmail] || "").trim());
    if (!hasLead) continue;
    const colored = bgs[i].some(function (c) { return c && c.toLowerCase() !== "#ffffff"; });
    if (colored) { ctx.coloredRows++; continue; }
    if (String(row[ctx.iRP]).trim() === "") { ctx.skippedBlank++; continue; }   // blank -> skip, stay uncoloured
    ctx.eligible.push(i);
  }
  return ctx;
}

function LA_write(sh, ctx, outcomes) {
  if (!outcomes.length) return;
  const byColor = {};
  outcomes.forEach(function (o) {
    sh.getRange(o.rowNum, ctx.statusCol).setValue(o.text);
    (byColor[o.color] = byColor[o.color] || []).push("A" + o.rowNum + ":" + ctx.lastColLetter + o.rowNum);
  });
  Object.keys(byColor).forEach(function (c) { sh.getRangeList(byColor[c]).setBackground(c); });
  SpreadsheetApp.flush();
}

function LA_col(n) {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function LA_phone(v) { return String(v === null || v === undefined ? "" : v).replace(/\D/g, "").slice(-10); }


// ─── BITRIX HELPERS ──────────────────────────────────────────────────────────

function LA_api(method, payload, attempts) {
  attempts = attempts || 1;
  let last = { error: "NETWORK", error_description: "no response" };
  for (let a = 0; a < attempts; a++) {
    Utilities.sleep(LA.SLEEP_MS * (a + 1));
    try {
      const resp = UrlFetchApp.fetch(LA.WEBHOOK + method, {
        method: "post", contentType: "application/json",
        payload: JSON.stringify(payload || {}), muteHttpExceptions: true
      });
      const code = resp.getResponseCode(), txt = resp.getContentText();
      let data = null;
      try { data = JSON.parse(txt); } catch (e) {}
      if (data && !data.error) return data;
      last = data || { error: "HTTP_" + code, error_description: txt.slice(0, 200) };
      const transient = !data || code >= 500 || code === 429 || LA_TRANSIENT.indexOf(String(data.error)) > -1;
      if (!transient) return last;
    } catch (e) {
      last = { error: "NETWORK", error_description: String(e.message || e) };
    }
    if (a < attempts - 1) Utilities.sleep(2000 * (a + 1));
  }
  return last;
}

function LA_batch(cmd, attempts) {
  const d = LA_api("batch", { halt: 0, cmd: cmd }, attempts);
  if (!d || d.error || !d.result) return null;
  const r = d.result;
  return {
    result: (r.result && !Array.isArray(r.result)) ? r.result : {},
    errors: (r.result_error && !Array.isArray(r.result_error)) ? r.result_error : {}
  };
}

function LA_q(obj) {
  const out = [];
  (function walk(o, p) {
    Object.keys(o).forEach(function (k) {
      const v = o[k];
      const key = p ? p + "[" + encodeURIComponent(k) + "]" : encodeURIComponent(k);
      if (v !== null && typeof v === "object") walk(v, key);
      else out.push(key + "=" + encodeURIComponent(v === null || v === undefined ? "" : v));
    });
  })(obj, "");
  return out.join("&");
}

function LA_hits(r) {
  const s = {};
  if (r && !Array.isArray(r)) {
    Object.keys(r).forEach(function (t) { (r[t] || []).forEach(function (id) { s[t + " #" + id] = 1; }); });
  }
  return s;
}

function LA_isTransient(er) {
  const code = typeof er === "string" ? er : String(er.error || "");
  return LA_TRANSIENT.indexOf(code) > -1;
}

function LA_errMsg(er) {
  if (typeof er === "string") return er;
  return String(er.error_description || er.error || JSON.stringify(er)).slice(0, 150);
}

function LA_fetchUsers() {
  const map = {};
  let start = 0;
  while (true) {
    const d = LA_api("user.get", { FILTER: { ACTIVE: true }, start: start }, 4);
    if (!d || d.error || !d.result) throw new Error("Could not fetch Bitrix users: " + (d && (d.error_description || d.error)));
    d.result.forEach(function (u) { map[parseInt(u.ID, 10)] = (u.NAME + " " + (u.LAST_NAME || "")).trim(); });
    if (d.next) start = d.next; else break;
  }
  return map;
}

function LA_fetchStages() {
  const byName = {}, byId = {};
  let start = 0;
  while (true) {
    const d = LA_api("crm.status.list", { filter: { ENTITY_ID: "STATUS" }, start: start }, 4);
    if (!d || d.error || !d.result) throw new Error("Could not fetch Bitrix lead stages: " + (d && (d.error_description || d.error)));
    d.result.forEach(function (s) {
      byName[String(s.NAME).toLowerCase().trim()] = s.STATUS_ID;
      byId[String(s.STATUS_ID).toLowerCase().trim()] = s.STATUS_ID;
    });
    if (d.next) start = d.next; else break;
  }
  return { byName: byName, byId: byId };
}

function LA_defaultStage(stages) {
  for (let i = 0; i < LA.DEFAULT_STAGE_NAMES.length; i++) {
    const id = LA_stageId(stages, LA.DEFAULT_STAGE_NAMES[i]);
    if (id) return id;
  }
  return null;
}

function LA_stageId(stages, v) {
  const k = String(v).toLowerCase().trim();
  return stages.byName[k] || stages.byId[k] || null;
}

function LA_fields(c, ctx) {
  const g = function (i) { return i > -1 ? String(c.row[i] === undefined || c.row[i] === null ? "" : c.row[i]).trim() : ""; };
  const src = LA_SOURCE[(g(ctx.iSource) || LA.DEFAULT_SOURCE).toLowerCase()] || LA_SOURCE[LA.DEFAULT_SOURCE.toLowerCase()];
  const f = {
    TITLE: c.name,
    ASSIGNED_BY_ID: c.rpId,
    SOURCE_ID: src,
    STATUS_ID: c.stageId,
    ADDRESS_CITY: g(ctx.iCity),
    PHONE: [{ VALUE: c.phone, VALUE_TYPE: "WORK" }],
    UF_CRM_1769692224: g(ctx.iScore) || LA.DEFAULT_SCORE,
    UF_CRM_1770124492: g(ctx.iEdu),
    UF_CRM_1771480249: g(ctx.iDesig),
    UF_CRM_1776941001: g(ctx.iProg),
    UF_CRM_1771396638: g(ctx.iPrev)
  };
  if (c.email) f.EMAIL = [{ VALUE: c.email, VALUE_TYPE: "WORK" }];
  const sub = LA_SUB_SOURCE[g(ctx.iSub).toLowerCase()];
  if (sub !== undefined) f.UF_CRM_1770449029 = sub;
  return f;
}


// ─── RECREATE HELPERS ────────────────────────────────────────────────────────

// Reads the 'Team' sheet (columns: Name | Bitrix ID). Returns { bitrixId: name }. Empty if missing.
function LA_readTeam() {
  const ids = {};
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LA.TEAM_SHEET);
  if (!sh || sh.getLastRow() < 2) return ids;
  const data = sh.getDataRange().getValues();
  const header = data[0].map(function (h) { return String(h).trim().toLowerCase(); });
  const iId = header.indexOf("bitrix id");
  const iName = header.indexOf("name");
  if (iId < 0) return ids;
  for (let i = 1; i < data.length; i++) {
    const id = parseInt(data[i][iId], 10);
    if (!isNaN(id)) ids[id] = iName > -1 ? String(data[i][iName]).trim() : String(id);
  }
  return ids;
}

// Saves every old lead to the backup sheet BEFORE it is deleted. Returns false if saving failed.
function LA_backup(part) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(LA.BACKUP_SHEET) || ss.insertSheet(LA.BACKUP_SHEET);
    if (sh.getLastRow() === 0) {
      sh.appendRow(["Time (IST)", "Leads sheet row", "Old lead ID", "Old stage", "Old owner ID", "New owner (Bitrix ID)", "Lead name", "Old lead data (JSON)"]);
    }
    const when = Utilities.formatDate(new Date(), LA.TZ, "dd MMM yyyy HH:mm:ss");
    const rows = part.map(function (x) {
      return [when, x.c.rowNum, x.lead.ID, x.label, x.lead.ASSIGNED_BY_ID, x.c.rpId, x.c.name,
              JSON.stringify(x.lead).slice(0, 45000)];
    });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    SpreadsheetApp.flush();
    return true;
  } catch (e) {
    LA_log("Backup failed - nothing was deleted: " + (e && e.message || e));
    return false;
  }
}

// Fields for a recreated lead: blank everything, keep city/education/designation from the old lead,
// Fresh stage, score 0, sub source P_RNR, owner = the Responsible Person typed in the Leads sheet.
function LA_recreateFields(x, stageId, ctx) {
  const c = x.c, old = x.lead;
  const gs = function (i) { return i > -1 ? String(c.row[i] === undefined || c.row[i] === null ? "" : c.row[i]).trim() : ""; };

  const f = {};
  LA_BLANK_UF.forEach(function (u) { f[u] = ""; });

  f.TITLE = c.name;
  f.PHONE = [{ VALUE: c.phone, VALUE_TYPE: "WORK" }];
  f.EMAIL = [{ VALUE: c.email, VALUE_TYPE: "WORK" }];

  const city = old.ADDRESS_CITY || gs(ctx.iCity);
  const edu = old.UF_CRM_1770124492 || gs(ctx.iEdu);
  const desig = old.UF_CRM_1771480249 || gs(ctx.iDesig);
  if (city) f.ADDRESS_CITY = city;
  if (edu) f.UF_CRM_1770124492 = edu;
  if (desig) f.UF_CRM_1771480249 = desig;

  f.SOURCE_ID = LA_SOURCE[LA.DEFAULT_SOURCE.toLowerCase()];
  f.STATUS_ID = stageId;
  f.UF_CRM_1769692224 = LA.DEFAULT_SCORE;            // set AFTER the blanking so the score really is 0
  f.UF_CRM_1770449029 = LA_SUB_SOURCE["p_rnr"];
  f.ASSIGNED_BY_ID = c.rpId;
  return f;
}


// ─── STATE / TRIGGERS ────────────────────────────────────────────────────────

function LA_loadState() {
  const s = PropertiesService.getScriptProperties().getProperty("LA_STATE");
  return s ? JSON.parse(s) : null;
}
function LA_saveState(st) { PropertiesService.getScriptProperties().setProperty("LA_STATE", JSON.stringify(st)); }
function LA_clearState() { PropertiesService.getScriptProperties().deleteProperty("LA_STATE"); }

function LA_schedule(ms) {
  LA_clearTriggers("LA_continue");
  ScriptApp.newTrigger("LA_continue").timeBased().after(ms).create();
}

function LA_clearTriggers(fn) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === fn) ScriptApp.deleteTrigger(t);
  });
}

function LA_toast(msg) {
  try { SpreadsheetApp.getActiveSpreadsheet().toast(msg, "Lead Assignment", 7); } catch (e) {}
}


// ─── EMAIL (counts only - no customer data) ──────────────────────────────────

function LA_email(st, mode, note) {
  const when = Utilities.formatDate(new Date(), LA.TZ, "dd MMM yyyy, hh:mm a");
  const tot = function (p) { return (p.count || 0) + (p.recreated || 0); };
  const people = Object.keys(st.perPerson || {}).map(function (k) { return st.perPerson[k]; })
    .sort(function (a, b) { return tot(b) - tot(a); });

  const cell = 'padding:8px 14px;border-bottom:1px solid #eee;text-align:center';
  let rows = "";
  people.forEach(function (p) {
    rows += '<tr><td style="padding:8px 14px;border-bottom:1px solid #eee">' + p.name + '</td>' +
            '<td style="' + cell + '">' + (p.count || 0) + '</td>' +
            '<td style="' + cell + '">' + (p.recreated || 0) + '</td>' +
            '<td style="' + cell + '"><b>' + tot(p) + '</b></td></tr>';
  });
  if (!rows) rows = '<tr><td colspan="4" style="padding:8px 14px;color:#888">No leads assigned</td></tr>';

  const byStage = Object.keys(st.recreatedByStage || {}).map(function (k) { return k + ": " + st.recreatedByStage[k]; }).join(" · ");

  const failed = mode === "failed";
  const subject = failed
    ? "❌ Lead Assignment stopped — " + ((st.assigned || 0) + (st.recreated || 0)) + " assigned so far"
    : "✅ Lead Assignment " + Utilities.formatDate(new Date(), LA.TZ, "dd MMM") + " — " +
      (st.assigned || 0) + " assigned, " + (st.recreated || 0) + " recreated, " + (st.duplicates || 0) + " duplicates";

  const stat = function (label, val, color) {
    return '<tr><td style="padding:6px 14px">' + label + '</td><td style="padding:6px 14px;text-align:right;font-weight:bold;color:' +
           (color || "#222") + '">' + (val || 0) + '</td></tr>';
  };

  const html =
    '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:560px;margin:20px auto;border:1px solid #ddd;border-radius:8px;overflow:hidden">' +
    '<div style="background:' + (failed ? "#c62828" : "#2e7d32") + ';color:#fff;padding:18px 24px"><h2 style="margin:0">' +
    (failed ? "Lead Assignment Stopped" : "Lead Assignment Complete") + '</h2><div style="font-size:12px;opacity:.85">' + when + '</div></div>' +
    '<div style="padding:18px 24px">' +
    (note ? '<p style="background:#fff3e0;padding:10px;border-radius:6px">' + note + '</p>' : "") +
    '<table style="width:100%;border-collapse:collapse">' +
    stat("✅ Assigned (new leads)", st.assigned, "#2e7d32") +
    stat("🔵 Recreated (old lead replaced)", st.recreated, "#1565c0") +
    (byStage ? '<tr><td colspan="2" style="padding:0 14px 6px;font-size:12px;color:#666">' + byStage + '</td></tr>' : "") +
    stat("🟠 Duplicates (not touched)", st.duplicates, "#e65100") +
    stat("🟡 Conflicts (phone or email exists, not created)", st.conflicts, "#b58900") +
    stat("🔴 Bad data (not created)", st.errors, "#c62828") +
    stat("⚪ Skipped – Responsible Person blank", st.skippedBlank) +
    stat("Chunks run", st.chunks) +
    '</table>' +
    '<h4 style="margin:20px 0 6px;color:#2e7d32">Assigned per person</h4>' +
    '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f1f8e9"><th style="padding:8px 14px;text-align:left">Counsellor</th><th style="padding:8px 14px">New</th><th style="padding:8px 14px">Recreated</th><th style="padding:8px 14px">Total</th></tr></thead><tbody>' +
    rows + '</tbody></table></div></div>';

  MailApp.sendEmail({ to: LA.EMAILS.join(","), subject: subject, htmlBody: html });
}
