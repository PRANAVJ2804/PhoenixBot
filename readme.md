# 🤖 Phoenix Admission Tracker Bot

> ⚡ Automated WhatsApp reporting bot for sales & admissions teams — reads Google Sheets in real time, posts weekly scorecards, monthly counters, and live admission countdowns to WhatsApp groups. Built with Python, Selenium, and Google Sheets API.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Setup & Installation](#setup--installation)
- [Configuration](#configuration)
- [How It Works](#how-it-works)
- [Development Journey & Changes](#development-journey--changes)
- [Known Issues & Fixes Applied](#known-issues--fixes-applied)
- [Schedule Reference](#schedule-reference)
- [Google Apps Script — University Segregator](#google-apps-script--university-segregator)

---

## 🎯 Overview

Phoenix Admission Tracker Bot is a Python automation system built for Phoenix Online Education's Floor 2 admissions team. It monitors a Google Sheet for new student admissions in real time, and automatically posts formatted scorecards to WhatsApp groups — eliminating the need for manual reporting across 3 sales teams (Team Prashanth, Team Shyam, Team Vamsi).

The system also includes a Google Apps Script module that automatically routes admitted students into university-specific sheets, organized by month.

---

## 🏗️ Architecture

```
Google Sheets (All Universities)
        │
        ▼
🐍 Python Bot (weekly_admission_bot.py)
  ├── 📊 Google Sheets API (gspread) — reads admissions every 60s
  ├── 🌐 Selenium + Chrome — controls WhatsApp Web
  │     ├── 💬 Team Prashanth Group → Weekly Scorecards + Monthly Counter
  │     └── 💬 Team Upnext Career Group → Weekly Scorecards + 100 Admission Countdown
  └── 🖥️ CMD Interface — target input on startup and every Monday

📜 Google Apps Script (university_segregator.gs)
  └── Auto-routes leads from Payment sheet → University-specific sheets by month
```

---

## ✨ Features

### 📊 Weekly Scorecard
- ⏱️ Triggered automatically 5 minutes after a new admission is detected in the sheet
- 🎯 Posts only for the team that got the new admission (not both teams every time)
- 📋 Shows: Target, Crushed, Remaining, Progress bar (emoji), Counsellor who closed, motivational quote
- 🎉 Celebration-style opening line that changes based on progress percentage
- 💬 65+ rotating motivational quotes — never repeats back to back
- 📤 Posts to **Team Prashanth** group (Prashanth + Shyam only) and **Team Upnext Career** group (all 3 teams)

### 📅 Monthly Counter
- 🕙 Posts every day at **10:30am** and **6:30pm** to Team Prashanth group
- 📈 Shows combined monthly progress for Team Prashanth and Team Shyam
- ⏳ Auto-calculates days remaining in the month
- 💡 Dynamic closing quote based on pace vs days left

### 🚀 100 Admission Countdown
- 🔥 Posts to **Team Upnext Career** group after every new admission (any team)
- 💯 Shows total admissions across all 3 teams vs the monthly countdown target
- ⚙️ Target is configurable via CMD on startup
- 📊 Progress bar + dynamic quote changes based on % achieved

### 🎯 Weekly Target Collection
- 📩 Every Monday 11am → DM sent to PRASHANTH, SHYAM, VAMSI asking for their weekly target
- 🖥️ Every Monday 12pm → CMD prompts operator to type in targets manually
- 🔄 Targets are reset every Monday — old week targets never carry over
- 🔒 All scorecard posting is blocked until targets are entered
- 🔁 If bot crashes and restarts mid-week → CMD asks for targets again on startup

### 📆 Monthly Target Collection
- 🖥️ Asked in CMD on every startup
- 🔔 On 1st of every month → WhatsApp reminder sent + CMD prompts for new targets
- 👥 Separate targets for Team Prashanth and Team Shyam

### 🧠 Smart Sheet Reading
- 📄 Reads across multiple month sections in the same sheet (handles blank rows between sections)
- 📅 Filters by Admission Date column (column F) — only valid dates are processed
- ⏭️ Skips header rows, blank rows, and non-team rows automatically
- ✅ Validates team names — only Prashanth, Shyam, Vamsi are counted
- 🔄 3-retry logic on Google API 500 errors
- 🛡️ Ignores count drops (transient API errors) to prevent false scorecard triggers

### 🏫 University Lead Segregator (Apps Script)
- ⚡ Auto-triggers on every new row added to Payment sheet
- 🗺️ Reads University column (M) and maps to correct university sheet
- 📅 Groups leads by month with styled headers
- 🔍 Duplicate detection by phone number OR email — deletes old entry and writes updated one
- 📦 Supports bulk backfill for existing data

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|-----------|
| 🐍 Bot Language | Python 3.14 |
| 🌐 WhatsApp Automation | Selenium + ChromeDriver |
| 📊 Sheet Reading | gspread + google-auth |
| ⏰ Scheduling | schedule |
| 📋 Clipboard (emoji fix) | pyperclip |
| 🔧 Driver Management | webdriver-manager |
| 📜 University Segregation | Google Apps Script |
| 🔐 Auth | Google Service Account (JSON key) |

---

## 📁 Project Structure

```
phoenix-admission-bot/
├── 🐍 weekly_admission_bot.py      # Main bot
├── 📜 university_segregator.gs     # Google Apps Script
├── 📦 requirements.txt             # Python dependencies
├── 🚫 .gitignore                   # Excludes credentials and session
└── 📖 README.md                    # This file
```

> ⚠️ `credentials.json` and `chrome_session/` are excluded from the repo. **Never commit these.**

---

## 🚀 Setup & Installation

### ✅ Prerequisites
- 🖥️ Windows machine (bot uses Windows file paths)
- 🐍 Python 3.10+
- 🌐 Google Chrome installed at `C:\Program Files\Google\Chrome\Application\chrome.exe`
- ☁️ A Google Cloud project with Sheets API and Drive API enabled

### Step 1 — Clone the repo
```bash
git clone https://github.com/yourusername/phoenix-admission-bot.git
cd phoenix-admission-bot
```

### Step 2 — Install dependencies
```bash
pip install -r requirements.txt
```

### Step 3 — Set up Google Sheets API 🔐
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project
3. Enable **Google Sheets API** and **Google Drive API**
4. Go to IAM & Admin → Service Accounts → Create Service Account
5. Under Keys → Add Key → Create New Key → JSON
6. Download the file and rename it `credentials.json`
7. Place it in the same folder as `weekly_admission_bot.py`
8. Share your Google Sheet with the service account email as **Viewer**

### Step 4 — Configure the bot ⚙️
Open `weekly_admission_bot.py` and update the CONFIG section at the top:

```python
SHEET_ID            = "your_google_sheet_id"
SHEET_TAB           = "Payment done Roll no pending"
CREDENTIALS_PATH    = r"C:\path\to\credentials.json"
CHROME_PROFILE_PATH = r"C:\path\to\chrome_session"

WHATSAPP_GROUP    = "Team Prashanth"
UPNEXT_GROUP      = "Team Upnext Career"
PRASHANTH_CONTACT = "PRASHANTH"
SHYAM_CONTACT     = "SHYAM"
VAMSI_CONTACT     = "VAMSI"
```

### Step 5 — Run the bot ▶️
```bash
python weekly_admission_bot.py
```

On first run:
- 🌐 Chrome opens with a fresh profile
- 📱 Scan the WhatsApp Web QR code with your phone
- 💾 Session is saved — no QR needed on restart
- 🖥️ CMD will ask for weekly and monthly targets

---

## ⚙️ Configuration

| Variable | Description |
|----------|-------------|
| `SHEET_ID` | 📊 Google Sheet ID from the URL |
| `SHEET_TAB` | 📋 Tab name to read admissions from |
| `CREDENTIALS_PATH` | 🔐 Full path to your credentials.json |
| `CHROME_PROFILE_PATH` | 🌐 Where the bot stores its Chrome session |
| `WHATSAPP_GROUP` | 💬 Exact name of the main WhatsApp group |
| `UPNEXT_GROUP` | 💬 Exact name of the Upnext Career group |
| `TARGET_ASK_TIME` | ⏰ Time to DM TLs for weekly target (default 11:00) |
| `TARGET_DEADLINE` | ⏰ Time to collect targets via CMD (default 12:00) |
| `MONTHLY_POST_AM` | 🕙 Morning monthly counter post time (default 10:30) |
| `MONTHLY_POST_PM` | 🕡 Evening monthly counter post time (default 18:30) |
| `COUNTDOWN_TARGET` | 🎯 Monthly combined target for countdown (set via CMD) |

---

## ⚙️ How It Works

### 🔄 Sheet Polling Loop (every 60 seconds)
1. 📖 Reads all rows from `Payment done Roll no pending`
2. 📅 Parses Admission Date (column F) — skips any row without a valid date
3. 👥 Filters by Team (column D) — only Prashanth, Shyam, Vamsi counted
4. 📊 Counts admissions within the current Monday to Sunday week range
5. 🔍 Compares with last known count
6. ⬆️ If count increased → marks that team as pending post
7. ⏱️ Starts 5-minute countdown on first detection
8. 📤 After 5 minutes → posts scorecard for only the teams that got new admissions
9. ⬇️ If count dropped → assumes API error, skips cycle entirely

### 📤 Scorecard Posting
- 💬 Team Prashanth group → Prashanth + Shyam scorecards only
- 💬 Team Upnext Career group → Prashanth + Shyam + Vamsi scorecards + countdown
- 📋 Messages sent via clipboard paste (avoids ChromeDriver emoji BMP issue)
- 🔄 Text box re-fetched after paste to avoid stale element errors

### 🎯 Target Management
- 🔄 Weekly targets stored in memory — reset every Monday at 11am
- 📆 Monthly targets stored in memory — reset on 1st of month
- 🔒 All posting blocked if weekly targets are 0
- 🖥️ On restart → CMD always asks for current targets

---

## 🛠️ Development Journey & Changes

This bot was built iteratively with multiple rounds of debugging and feature additions:

### v1.0 — 🚀 Basic WhatsApp Scorecard
- Initial build using Selenium to open WhatsApp Web and send formatted messages
- Chrome profile isolation to avoid conflicts with personal browser session
- Basic weekly scorecard with emoji progress bar

### v1.1 — 📊 Google Sheets Integration
- Switched from Selenium-based sheet reading to Google Sheets API
- Used gspread with service account credentials
- Fixed duplicate header row issue by reading raw values instead of get_all_records()
- Added column-index based reading to avoid header name mismatches

### v1.2 — 🔍 WhatsApp Message Reading Fix
- Original message-in XPath was returning empty text due to WhatsApp DOM update
- Discovered correct selector: span[@data-testid="selectable-text"]
- Added scroll_to_bottom() before reading to ensure latest messages are visible

### v1.3 — 😀 Emoji and Encoding Fix
- ChromeDriver threw BMP characters only error when typing emoji directly
- Fixed by switching all message sending to clipboard paste via pyperclip
- Stale element error on Enter key fixed by re-fetching text box after paste

### v1.4 — 🎯 Smart Per-Team Posting
- Previously posted both team scorecards on every admission
- Changed to track per-team admission counts separately
- Only posts scorecard for the team that got a new admission
- 5-minute window accumulates multiple admissions before posting

### v1.5 — 👥 Multi-Group Support
- Added Team Upnext Career group
- Team Prashanth group: Prashanth + Shyam only
- Upnext group: all 3 teams + monthly countdown
- Fixed group search for emoji group names using partial match

### v1.6 — 📅 Monthly Counter and Countdown
- Added monthly counter posting at 10:30am and 6:30pm
- Added 100-admission countdown posting after every new admission
- Monthly targets and countdown target collected via CMD
- Countdown target configurable — asked on startup

### v1.7 — 📄 Multi-Sheet Reading Fix
- Sheet has multiple month sections separated by blank rows and repeated headers
- Fixed by using explicit range A1:Z{last_row} to force reading entire sheet
- Added strict date validation — only rows with parseable dates in column F are processed
- Added team name validation — only known teams counted

### v1.8 — 🛡️ API Error Handling
- Google Sheets API occasionally returns 500 errors
- Added 3-retry logic with 5-second gaps
- Added count-drop detection — if any team count drops, entire poll cycle is skipped
- Prevents false new admission triggers from bad API responses

### v1.9 — 🎯 Target Collection Redesign
- Removed WhatsApp reply reading for target collection (unreliable)
- Monday 11am: DM sent to TLs, targets reset to 0
- Monday 12pm: CMD prompts operator directly
- Removed all WhatsApp reading logic — cleaner and more reliable
- Targets block all posting until set

### v2.0 — 🏫 University Segregator (Apps Script)
- Built Google Apps Script to auto-route leads to university sheets
- Maps DSU, VIT, SMU, MUJ, D Y Patil to dedicated sheets
- Groups leads by month with styled dark blue headers
- Duplicate detection by phone + email — replaces old entry with updated one
- Bulk backfill function for existing data
- Fixed onChange trigger → switched to onEdit trigger
- Fixed column count mismatch by writing row-by-row

---

## 🐛 Known Issues and Fixes Applied

| Issue | Root Cause | Fix Applied |
|-------|-----------|-------------|
| 😵 Emoji typing crash | ChromeDriver BMP limit | Clipboard paste via pyperclip |
| 💀 Stale element on Enter | DOM re-render after paste | Re-fetch text box after paste |
| 📨 Wrong group getting messages | WhatsApp search partial match | Exact title match with fallback |
| 📉 Count drops to 0 then spikes | Transient Google API 500 error | Skip cycle on any count drop |
| 🤖 Bot reading own messages as target | Outgoing messages in DOM | Filter to message-in class only |
| 📅 July entries not counted | Blank row between month sections | Explicit full-range sheet fetch |
| ⚡ Apps Script trigger not firing | onChange does not pass range info | Switched to onEdit trigger |
| 📊 Column mismatch in Apps Script | Two source sheets have different column counts | Write each row individually |

---

## 📅 Schedule Reference

| ⏰ Time | 🎯 Action |
|--------|----------|
| Monday 11:00am | Weekly targets reset + DM sent to all 3 TLs |
| Monday 12:00pm | CMD asks operator for weekly targets |
| Every 15 mins on Monday | CMD re-asks if targets still missing |
| Every 60 seconds | Sheet polled for new admissions |
| New admission + 5 mins | Scorecard posted to relevant groups |
| 10:30am daily | Monthly counter posted to Team Prashanth |
| 6:30pm daily | Monthly counter posted to Team Prashanth |
| 1st of month 10:00am | Monthly target reminder DM + CMD input |

---

## 🏫 Google Apps Script — University Segregator

### 🗺️ University Mapping

| Sheet Value | Target Sheet |
|-------------|-------------|
| DSU | DSU adm |
| VIT | VIT ADM |
| SMU | SMU/MUJ |
| MUJ | SMU/MUJ |
| D Y Patil | D Y Patil Admission |

### 🔧 Functions

| Function | Description |
|----------|-------------|
| onSheetEdit(e) | ⚡ Auto-trigger on every edit — routes new row to university sheet |
| backfillExistingLeads() | 📦 One-time bulk processing of existing data |
| setupTrigger() | 🔧 Run once to install the onEdit trigger |
| findAndDeleteDuplicate() | 🔍 Checks phone + email, deletes old row if match found |
| addRowToMonthSection() | 📅 Inserts row under correct month header in target sheet |

### ⚙️ Setup
1. 📂 Open the All Universities Google Sheet
2. 🔧 Extensions → Apps Script
3. 📋 Paste university_segregator.gs contents
4. ▶️ Run setupTrigger once
5. ▶️ Run backfillExistingLeads to process existing data
6. ✅ From then on — every new row triggers automatically

---

## 👨‍💻 Author

Built for **Phoenix Online Education** — Floor 2 Admissions Operations.
