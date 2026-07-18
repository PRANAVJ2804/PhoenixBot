import time
import re
import random
import gspread
import schedule
import json
import os
from datetime import datetime, timedelta
from calendar import monthrange
from google.oauth2.service_account import Credentials
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
from webdriver_manager.chrome import ChromeDriverManager

# ─────────────────────────────────────────────
#  CONFIG
# ─────────────────────────────────────────────
SHEET_ID            = "1EPI1eIECYm5DQCBarkmPlwscd6Ycn007Te1tysYIUeI"
SHEET_TAB           = "Payment done Roll no pending"
CREDENTIALS_PATH    = r"C:\Users\USER\Desktop\whatsapp_bot\credentials.json"
CHROME_PROFILE_PATH = r"C:\Users\USER\Desktop\whatsapp_bot\chrome_session"

WHATSAPP_GROUP    = "Team Prashanth"
UPNEXT_GROUP      = "Team \U0001f985 Upnext Career \U0001f985"
PRASHANTH_CONTACT = "PRASHANTH"
SHYAM_CONTACT     = "SHYAM"
VAMSI_CONTACT     = "VAMSI"

TARGET_ASK_TIME     = "11:00"
TARGET_DEADLINE     = "12:00"
MONTHLY_POST_AM     = "10:30"
MONTHLY_POST_PM     = "18:30"

# ─────────────────────────────────────────────
#  STATE
# ─────────────────────────────────────────────
weekly_targets     = {"prashanth": 0, "shyam": 0, "vamsi": 0}
monthly_targets    = {"prashanth": 0, "shyam": 0}
last_weekly_counts = {"prashanth": -1, "shyam": -1, "vamsi": -1}
pending_post       = {
    "prashanth": False, "shyam": False, "vamsi": False,
    "trigger_time": None,
    "prashanth_closers": [], "shyam_closers": [], "vamsi_closers": []
}
last_used_quote    = {"prashanth": None, "shyam": None, "vamsi": None}

# ─────────────────────────────────────────────
#  QUOTES — celebration, sarcastic, comedy, motivational
# ─────────────────────────────────────────────
QUOTES = {
    "high": [
        "🏁 Almost there. Don't stop — finish lines don't move themselves.",
        "🚀 One final push. Make it count.",
        "🏆 'It always seems impossible until it's done.' Almost done. Finish it.",
        "💪 Champions don't slow down at the finish line. Speed up.",
        "🔥 'The secret of getting ahead is getting started.' You started. Now finish.",
        "⚡ Single digits away. This is what legends are made of.",
        "🎯 'Excellence is not a destination but a continuous journey.' Keep moving.",
        "🏅 So close. The target can smell you coming.",
        "🌟 Last few left. Don't let the scoreboard lie about this team.",
        "💥 'Push yourself because no one else is going to do it for you.' Final push — NOW.",
        "🦁 Almost 100%. Almost isn't enough. Finish what you started.",
        "🎖️ The finish line is inches away. Don't stop running now.",
        "🔑 'Success usually comes to those who are too busy to be looking for it.' Keep closing.",
    ],
    "good": [
        "⚡ Strong numbers. Keep the energy — don't let it drop now.",
        "📈 'Success is the sum of small efforts repeated daily.' Keep repeating.",
        "🎯 This is what a good week looks like. Build on it.",
        "💼 Momentum is everything. Protect it like it's your last lead.",
        "🔥 'The harder you work, the luckier you get.' Keep working.",
        "💡 Consistency beats intensity every single time. Stay consistent.",
        "📊 Numbers are talking. Make sure they keep saying the right things.",
        "🌟 'Great things never come from comfort zones.' Push further.",
        "🏃 70%+ in. The finish line is closer than it looks — run.",
        "🎪 'Quality is not an act, it is a habit.' Make closing a habit.",
        "💫 Strong momentum. Don't waste it on distractions — stay locked in.",
        "🦅 'Soar high or stay grounded — champions always choose to soar.'",
        "🔮 Good numbers today. Great numbers by end of week. That's the goal.",
        "🌊 Ride this wave all the way to the target. Don't get off now.",
    ],
    "mid": [
        "⏱️ Halfway there. The second half is where champions are decided.",
        "💡 'It does not matter how slowly you go, as long as you do not stop.' Keep moving.",
        "🎯 Halftime. Score is decent. Finish is everything.",
        "🏃 'The only way to do great work is to love what you do.' Love the grind.",
        "⚡ 50% done. Now do it again — better, faster.",
        "🔔 Good start doesn't guarantee good finish. Chase it.",
        "💪 'Believe you can and you're halfway there.' Now prove the other half.",
        "🌊 The target is achievable. The question is — do you want it enough?",
        "🔥 Halftime doesn't mean rest time. It means double time.",
        "🎪 'The difference between ordinary and extraordinary is that little extra.' Give that extra.",
        "🏆 50% is a promise. 100% is the delivery. Deliver.",
        "💎 'Hard work beats talent when talent doesn't work hard.' Work harder.",
        "🚀 'You are never too old to set another goal or dream a new dream.' Dream bigger, close faster.",
        "🌟 Midweek check — still time to make this a legendary week.",
    ],
    "low": [
        "📊 Behind pace — but the week isn't over. Not even close.",
        "💪 'It's not about how hard you hit. It's about how hard you can get hit and keep moving.' Keep moving.",
        "🔔 The target is still within reach. But only if you reach for it.",
        "🏃 Slow start is fine. Slow finish is not an option.",
        "🎯 'You don't have to be great to start, but you have to start to be great.' Start now.",
        "🔥 Every admission from here changes the final number. Make them count.",
        "⚡ Not where we want to be. Let's change that — today, not tomorrow.",
        "💡 'The comeback is always stronger than the setback.' Prove it.",
        "🦁 Behind doesn't mean beaten. Pick up the pace — NOW.",
        "🌊 'Fall seven times, stand up eight.' Stand up. Right now.",
        "🔮 The scoreboard looks tough. Change what you can — your effort.",
        "🎖️ 'It's not whether you get knocked down, it's whether you get up.' Get up.",
        "💫 There's still time. There's still a target. There's still a team. Go.",
        "🚀 Pressure makes diamonds. This team is about to shine.",
    ],
    "critical": [
        "🚨 This week needs a completely different energy. Starting right now.",
        "💢 'The pain of discipline is far less than the pain of regret.' Choose discipline.",
        "🔴 Every hour matters from here. Every single one.",
        "⏰ 'You miss 100% of the shots you don't take.' Take more shots.",
        "💪 Difficult weeks build the strongest teams. This is that week.",
        "🌟 'It always seems impossible until it's done.' Make it done.",
        "🎯 The target won't lower itself. But the effort can rise.",
        "🔥 'Dream big. Work hard. Stay focused.' All three. Right now.",
        "🦅 'Eagles don't flock — you have to find them one at a time.' Find every lead.",
        "💎 Tough week. Tougher team. Prove it.",
        "🌊 Low numbers are a message. The message is: work harder.",
        "🔮 'Champions are made in the moments when they want to quit but don't.' Don't quit.",
        "🏆 This isn't the end of the story. Write a better second half.",
        "🚀 'The only limit to our realization of tomorrow is our doubts of today.' Drop the doubts.",
    ]
}

def get_quote(pct, team_key):
    if pct >= 90:   pool = QUOTES["high"]
    elif pct >= 70: pool = QUOTES["good"]
    elif pct >= 50: pool = QUOTES["mid"]
    elif pct >= 30: pool = QUOTES["low"]
    else:           pool = QUOTES["critical"]
    available = [q for q in pool if q != last_used_quote.get(team_key)]
    chosen = random.choice(available if available else pool)
    last_used_quote[team_key] = chosen
    return chosen

def get_opening_line(pct, team_name):
    if pct >= 90:   return f"\U0001f680 Almost there! Team {team_name} is unstoppable!"
    elif pct >= 70: return f"\U0001f525 Team {team_name} is heating up!"
    elif pct >= 50: return f"\U0001f389 BOOM! Team {team_name} scores!"
    elif pct >= 30: return f"\u26a1 Team {team_name} is in the game!"
    else:           return f"\U0001f44a Team {team_name} \u2014 time to wake up!"

# ─────────────────────────────────────────────
#  GOOGLE SHEETS
# ─────────────────────────────────────────────
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly"
]

SHEET_TABS = ["Payment done Roll no pending"]

def get_all_rows():
    """Read both tabs with retry on transient API errors."""
    for attempt in range(3):
        try:
            creds  = Credentials.from_service_account_file(CREDENTIALS_PATH, scopes=SCOPES)
            client = gspread.authorize(creds)
            wb     = client.open_by_key(SHEET_ID)
            rows   = []

            for tab_name in SHEET_TABS:
                try:
                    sheet      = wb.worksheet(tab_name)
                    # Use explicit large range to force reading past blank rows
                    last_row   = sheet.row_count
                    all_values = sheet.get("A1:Z" + str(last_row)) if last_row else []
                    if not all_values:
                        continue

                    for row in all_values:
                        # Always process every row — never skip due to blank rows
                        # Only skip if row is too short to have required columns
                        if not row or len(row) < 6:
                            continue

                        counsellor     = row[2].strip() if len(row) > 2 else ""
                        team           = row[3].strip() if len(row) > 3 else ""
                        admission_date = row[5].strip() if len(row) > 5 else ""

                        # Must have a valid date — skips headers and blank rows naturally
                        parsed = parse_date(admission_date)
                        if not parsed:
                            continue

                        # Must be a known team
                        if team.lower() not in ["prashanth", "shyam", "vamsi"]:
                            continue

                        first_name = counsellor.split("/")[0].strip() if "/" in counsellor else counsellor.strip()
                        rows.append({
                            "Counsellors":    counsellor,
                            "FirstName":      first_name,
                            "Team":           team,
                            "Admission Date": admission_date,
                        })
                except Exception as e:
                    print(f"[SHEET ERROR] Tab '{tab_name}': {e}")
                    continue

            # Only return if we got a reasonable result
            if rows or attempt == 2:
                return rows

        except Exception as e:
            print(f"[SHEET ERROR] Attempt {attempt+1}/3: {e}")
            time.sleep(5)

    return []

def get_week_range():
    today  = datetime.now().date()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday

def get_month_range():
    today     = datetime.now().date()
    first_day = today.replace(day=1)
    last_day  = today.replace(day=monthrange(today.year, today.month)[1])
    return first_day, last_day

def days_left_in_month():
    today    = datetime.now().date()
    last_day = today.replace(day=monthrange(today.year, today.month)[1])
    return (last_day - today).days

def parse_date(date_str):
    for fmt in ["%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"]:
        try:
            return datetime.strptime(date_str, fmt).date()
        except:
            continue
    return None

def count_admissions(date_start, date_end):
    rows = get_all_rows()
    counts = {"prashanth": 0, "shyam": 0, "vamsi": 0,
              "prashanth_counsellors": [], "shyam_counsellors": [], "vamsi_counsellors": []}
    for row in rows:
        team = row["Team"].lower()
        parsed = parse_date(row["Admission Date"])
        if not parsed or not (date_start <= parsed <= date_end):
            continue
        if team == "prashanth":
            counts["prashanth"] += 1
            counts["prashanth_counsellors"].append(row["FirstName"])
        elif team == "shyam":
            counts["shyam"] += 1
            counts["shyam_counsellors"].append(row["FirstName"])
        elif team == "vamsi":
            counts["vamsi"] += 1
            counts["vamsi_counsellors"].append(row["FirstName"])
    counts["total_rows"] = len(rows)
    return counts

def count_weekly_admissions():
    monday, sunday = get_week_range()
    return count_admissions(monday, sunday)

def count_monthly_admissions():
    first, last = get_month_range()
    return count_admissions(first, last)

# ─────────────────────────────────────────────
#  SELENIUM / WHATSAPP
# ─────────────────────────────────────────────
chrome_options = Options()
chrome_options.add_argument(f"user-data-dir={CHROME_PROFILE_PATH}")
chrome_options.add_argument("--start-maximized")
chrome_options.binary_location = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
chrome_options.add_experimental_option("detach", True)

driver = None
wait   = None

def init_driver():
    global driver, wait
    service = Service(ChromeDriverManager().install())
    driver  = webdriver.Chrome(service=service, options=chrome_options)
    wait    = WebDriverWait(driver, 60)
    driver.get("https://web.whatsapp.com")
    print("[BOT] Waiting for WhatsApp Web — scan QR if needed...")
    wait.until(EC.presence_of_element_located((By.XPATH, '//span[@title]')))
    time.sleep(5)
    print("[BOT] WhatsApp loaded.")

def open_chat(name):
    try:
        chats = driver.find_elements(By.XPATH, f'//span[@title="{name}"]')
        if chats:
            chats[0].click()
            time.sleep(2)
            return True
        search_box = wait.until(EC.presence_of_element_located(
            (By.XPATH, '//div[@contenteditable="true"][@data-tab="3"]')
        ))
        search_box.click()
        search_box.clear()
        search_box.send_keys(name)
        time.sleep(2)
        result = wait.until(EC.presence_of_element_located(
            (By.XPATH, f'//span[@title="{name}"]')
        ))
        result.click()
        time.sleep(2)
        return True
    except Exception as e:
        print(f"[CHAT ERROR] Could not open '{name}': {e}")
        return False

def send_message(text):
    try:
        import pyperclip
        pyperclip.copy(text)
        # Find and click text box
        text_box = wait.until(EC.presence_of_element_located(
            (By.XPATH, '//div[@contenteditable="true"][@data-tab="10"]')
        ))
        text_box.click()
        time.sleep(0.5)
        # Paste via clipboard
        webdriver.ActionChains(driver).key_down(Keys.CONTROL).send_keys('v').key_up(Keys.CONTROL).perform()
        time.sleep(1)
        # Re-find text box to avoid stale element — DOM may have re-rendered after paste
        text_box = driver.find_element(By.XPATH, '//div[@contenteditable="true"][@data-tab="10"]')
        text_box.send_keys(Keys.ENTER)
        time.sleep(2)
        print("[BOT] Message sent.")
    except Exception as e:
        print(f"[SEND ERROR] {e}")

def scroll_to_bottom():
    try:
        driver.execute_script(
            "var pane = document.querySelector('#main'); "
            "if(pane) pane.scrollTop = pane.scrollHeight;"
        )
    except:
        pass
    time.sleep(1)

def read_last_messages(n=30):
    try:
        scroll_to_bottom()
        msgs = driver.find_elements(
            By.XPATH,
            '//div[contains(@class,"message-in")]//span[@data-testid="selectable-text"]'
        )
        texts = [m.text.strip() for m in msgs[-n:] if m.text.strip()]
        print(f"[DEBUG] Read {len(texts)} incoming messages: {texts[-3:]}")
        return texts
    except Exception as e:
        print(f"[READ ERROR] {e}")
        return []

def extract_number_from_messages(messages):
    for msg in reversed(messages):
        match = re.search(r'\b(\d{1,4})\b', msg)
        if match:
            return int(match.group(1))
    return None

def count_incoming_messages():
    try:
        scroll_to_bottom()
        msgs = driver.find_elements(By.XPATH, '//div[contains(@class,"message-in")]')
        return len(msgs)
    except:
        return 0

# ─────────────────────────────────────────────
#  WEEKLY SCORECARD BUILDER — CELEBRATION STYLE
# ─────────────────────────────────────────────
def build_weekly_scorecard(team_name, done, target, week_start, week_end, team_key, new_closers=None):
    pending  = max(target - done, 0)
    week_str = f"{week_start.strftime('%d %b')} \u2013 {week_end.strftime('%d %b %Y')}"
    pct      = int((done / target) * 100) if target > 0 else 0
    bar      = "\U0001f7e9" * int(pct/10) + "\u2b1c" * (10 - int(pct/10))
    opening  = get_opening_line(pct, team_name)
    quote    = get_quote(pct, team_key)

    closer_section = ""
    if new_closers:
        closer_lines   = "\n".join([f"\U0001f3af {name} just closed one!" for name in new_closers])
        closer_section = f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n{closer_lines}\n"

    msg = (
        f"{opening}\n"
        f"\U0001f5d3 Week: {week_str}\n"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
        f"\U0001f3c6 Target      :  *{target}*\n"
        f"\U0001f525 Crushed     :  *{done}*\n"
        f"\u26a1 Remaining  :  *{pending}*\n"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
        f"{bar}  {pct}%\n"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
        f"{closer_section}"
        f"\"{quote}\""
    )
    return msg

# ─────────────────────────────────────────────
#  MONTHLY COUNTDOWN BUILDER — 100 ADMISSIONS
# ─────────────────────────────────────────────
COUNTDOWN_TARGET = 100  # Will be overridden by CMD input on startup

COUNTDOWN_QUOTES = {
    "done": [
        "🏆 Mission complete. Ee team different aagide — salute!",
        "🎉 Century unlocked. Innu yaavdu namballa — aadre idhu nijja!",
        "💯 100 ho gaya. Yeh team kuch aur hi level ki hai.",
        "🥳 100 admissions. History maadidra. Legends these guys!",
        "🔥 Target smashed. Ee team ge salaam — absolute beasts!",
    ],
    "high": [
        "🏁 Kೊನೆಯ few matthe — illi nillbeda. Legend finish maadi!",
        "💥 Single digits away. Full send. Yalla!",
        "🎯 Ittu kaḍime — everything else can wait. Close madi.",
        "⚡ Itihas baraedaagidhey. Neevu aadru nillbaardu.",
        "🔥 90+ in. Last ones are hardest. Close them anyway.",
        "🚀 Bas kuch aur — ruko mat. Century pakki karo.",
        "🏆 Trip aagbeda — century kaaṇtide. One final push!",
        "💪 So close to 100. Don't you dare slow down now.",
    ],
    "good": [
        "⚡ Ee momentum nodidra — kai bidu beda. Munde hogi.",
        "🏃 70+ done. Finish line closer than it looks. Run.",
        "🔥 Zabardast chal raha hai. Ab rukna mat.",
        "📈 Numbers like this don't happen by accident. Keep grinding.",
        "💪 Tumbaa chennaagide — aadre illi nillbaardu. Push maadi.",
        "🎯 Strong pace. Don't let the foot off the gas now.",
        "✅ Isse accha chal raha hai — ab aur accha karo.",
    ],
    "mid": [
        "⏱️ 50 aagide — 50 irothe. Same energy. Yalla maadi!",
        "💼 Adha century pakka. Doosra adha bhi karo — abhi.",
        "🎯 Halfway to the mission. Second half is where it matters.",
        "🔔 Halftime — aadre ee team slow second half maadalla.",
        "💡 50 done. 50 to go. Idu easy alla — aadre possible.",
        "⚡ Half century aagide. Full century beku. Keep moving.",
        "🏃 Adha ho gaya. Baaki adha bhi hoga — agar chale toh.",
    ],
    "low": [
        "🚨 X admissions. Y days. 3 teams. Excuses beda.",
        "😤 Pace sari illa — aadre game muttide alla. Odu!",
        "🏃 Peeche ho — lekin bahar nahi. Tez chalo abhi.",
        "⏰ Every admission changes the final number. Move now.",
        "📢 Nodi — target wait maadalla. Neevu wait maadbaardi.",
        "🔧 Pace fix maadi — century aagogu, aadre abhi beku.",
        "💢 Behind pace doesn't mean out of the race. Sprint now.",
    ],
    "critical": [
        "🆘 Urgency beku — ee numbers nodidre gottagatte!",
        "🚒 3 teams. 1 mission. X admissions. Act like it. NOW.",
        "💀 Abhi nahi toh kab? Kal nahi aayega wapas.",
        "🔴 No soft pedalling. Century won't close itself.",
        "😳 Ee scoreboard nodi naachike aagbeku — change maadi ASAP.",
        "🚨 This is not a drill. Century is slipping. Move NOW.",
        "😤 Explain maadokke ready irabahudu — aadre fix maadodu better.",
    ]
}

last_countdown_quote = None

def get_countdown_quote(pct, remaining):
    global last_countdown_quote
    if pct >= 100:   pool = COUNTDOWN_QUOTES["done"]
    elif pct >= 90:  pool = COUNTDOWN_QUOTES["high"]
    elif pct >= 70:  pool = COUNTDOWN_QUOTES["good"]
    elif pct >= 50:  pool = COUNTDOWN_QUOTES["mid"]
    elif pct >= 30:  pool = COUNTDOWN_QUOTES["low"]
    else:            pool = COUNTDOWN_QUOTES["critical"]

    available = [q for q in pool if q != last_countdown_quote]
    chosen = random.choice(available if available else pool)
    # Replace placeholders
    chosen = chosen.replace("X admissions", f"{remaining} admissions")
    chosen = chosen.replace("Y days", f"{days_left_in_month()} days")
    chosen = chosen.replace("6 to go", f"{remaining} to go")
    last_countdown_quote = chosen
    return chosen

def build_monthly_countdown():
    counts     = count_monthly_admissions()
    total_done = counts["prashanth"] + counts["shyam"] + counts["vamsi"]
    remaining  = max(COUNTDOWN_TARGET - total_done, 0)
    days_left  = days_left_in_month()
    month_name = datetime.now().strftime("%B").upper()
    pct        = min(int((total_done / COUNTDOWN_TARGET) * 100), 100)
    bar_filled = int(pct / 10)
    bar        = "🟩" * bar_filled + "⬜" * (10 - bar_filled)
    quote      = get_countdown_quote(pct, remaining)
    line       = "━" * 24
    parts = [
        "🚀 " + month_name + " MISSION — 100 ADMISSIONS",
        line,
        "📅 " + str(days_left) + " days left  |  " + month_name.title() + " 2026",
        line,
        "✅ Locked In    :  *" + str(total_done) + "*",
        "🎯 Mission      :  *" + str(COUNTDOWN_TARGET) + "*",
        "🔥 To Go        :  *" + str(remaining) + "*",
        line,
        bar + "  " + str(pct) + "%",
        line,
        "⚡ \"" + quote + "\""
    ]
    return "\n".join(parts)

# ─────────────────────────────────────────────
#  MONTHLY COUNTER BUILDER
# ─────────────────────────────────────────────
def build_monthly_counter():
    counts     = count_monthly_admissions()
    first_day, last_day = get_month_range()
    days_left  = days_left_in_month()
    month_name = first_day.strftime('%B').upper()
    month_str  = f"01 {first_day.strftime('%b')} \u2013 {last_day.strftime('%d %b %Y')}"

    p_done    = counts["prashanth"]
    s_done    = counts["shyam"]
    p_target  = monthly_targets["prashanth"]
    s_target  = monthly_targets["shyam"]
    p_pending = max(p_target - p_done, 0)
    s_pending = max(s_target - s_done, 0)
    total_pending = p_pending + s_pending

    if total_pending == 0:
        quote = "Target smashed. Absolute legends. \U0001f3c6"
    elif days_left <= 3:
        quote = f"{total_pending} admissions. {days_left} days. No more excuses."
    elif days_left <= 7:
        quote = f"Last week of the month. {total_pending} pending. This is crunch time."
    elif total_pending > 40:
        quote = f"{total_pending} admissions standing between you and the target. Clock is ticking."
    else:
        quote = f"{total_pending} to go. {days_left} days left. Perfectly doable \u2014 if you move now."

    msg = (
        f"\U0001f3af {month_name} ADMISSION COUNTER\n"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
        f"\U0001f4c5 {month_str}  |  *{days_left} days left*\n"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
        f"\U0001f3f7 *TEAM PRASHANTH*\n"
        f"\U0001f3c6 Target      :  *{p_target}*\n"
        f"\U0001f525 Achieved   :  *{p_done}*\n"
        f"\u23f3 Pending     :  *{p_pending}*\n"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
        f"\U0001f3f7 *TEAM SHYAM*\n"
        f"\U0001f3c6 Target      :  *{s_target}*\n"
        f"\U0001f525 Achieved   :  *{s_done}*\n"
        f"\u23f3 Pending     :  *{s_pending}*\n"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
        f"\"{quote}\""
    )
    return msg

# ─────────────────────────────────────────────
#  TARGET COLLECTION
# ─────────────────────────────────────────────
def ask_for_weekly_targets():
    """Monday 11am — send DM, reset targets to 0, wait for CMD input at 12pm."""
    if datetime.now().weekday() != 0:
        return
    # Reset last week's targets
    weekly_targets["prashanth"] = 0
    weekly_targets["shyam"]     = 0
    weekly_targets["vamsi"]     = 0
    print("[BOT] Weekly targets reset for new week.")
    msg = (
        "\U0001f4cb *Weekly Target Check-In*\n"
        "New week, new target! \U0001f4aa\n"
        "What is your *team's weekly admission target* for this week?\n"
        "Please reply with the number."
    )
    print("[BOT] Sending weekly target request to all 3...")
    for contact in [PRASHANTH_CONTACT, SHYAM_CONTACT, VAMSI_CONTACT]:
        open_chat(contact)
        send_message(msg)
    print("[BOT] Messages sent. Targets will be collected at 12pm via CMD.")

def read_target_from_chat(contact):
    open_chat(contact)
    time.sleep(2)
    msgs = read_last_messages(30)
    return extract_number_from_messages(msgs)

def confirm_target(contact, team_name, target):
    open_chat(contact)
    send_message(
        f"\u2705 Got it! Target locked in \u2014 *{target} admissions* for Team {team_name}.\n"
        f"Let's close them out. \U0001f4aa"
    )

def collect_weekly_targets():
    """Monday 12pm — ask targets in CMD. No WhatsApp reading."""
    if datetime.now().weekday() != 0:
        return
    print("\n[BOT] *** MONDAY TARGET COLLECTION ***")
    print("[BOT] Messages sent to Prashanth, Shyam & Vamsi.")
    print("[BOT] Enter this week's targets now:")
    try:
        for key, name in [("prashanth","Prashanth"), ("shyam","Shyam"), ("vamsi","Vamsi")]:
            val = input(f"    Team {name} weekly target: ").strip()
            weekly_targets[key] = int(val) if val.isdigit() else 0
        print(f"[BOT] Targets set — P:{weekly_targets['prashanth']} S:{weekly_targets['shyam']} V:{weekly_targets['vamsi']}")
        print("[BOT] Bot is now active for this week.")
    except Exception as e:
        print(f"[BOT] CMD input error: {e}")

def retry_missing_weekly_targets():
    """Every 15 mins on Monday — if targets still 0, ask again in CMD."""
    if datetime.now().weekday() != 0:
        return
    if weekly_targets["prashanth"] and weekly_targets["shyam"] and weekly_targets["vamsi"]:
        return
    print("\n[BOT] Targets still missing. Please enter now:")
    try:
        for key, name in [("prashanth","Prashanth"), ("shyam","Shyam"), ("vamsi","Vamsi")]:
            if not weekly_targets[key]:
                val = input(f"    Team {name} weekly target: ").strip()
                weekly_targets[key] = int(val) if val.isdigit() else 0
        print(f"[BOT] Targets updated — P:{weekly_targets['prashanth']} S:{weekly_targets['shyam']} V:{weekly_targets['vamsi']}")
    except Exception as e:
        print(f"[BOT] CMD input error: {e}")

# ─────────────────────────────────────────────
#  MONTHLY TARGET COLLECTION
# ─────────────────────────────────────────────
def ask_monthly_targets_in_cmd():
    global monthly_targets, COUNTDOWN_TARGET
    print("\n[BOT] Please enter monthly targets:")
    try:
        p_t = input("    Team Prashanth monthly target: ").strip()
        s_t = input("    Team Shyam monthly target: ").strip()
        c_t = input("    Combined countdown target (all 3 teams): ").strip()
        monthly_targets["prashanth"] = int(p_t) if p_t.isdigit() else 0
        monthly_targets["shyam"]     = int(s_t) if s_t.isdigit() else 0
        COUNTDOWN_TARGET             = int(c_t) if c_t.isdigit() else 100
        print(f"[BOT] Monthly targets set — Prashanth: {monthly_targets['prashanth']} | Shyam: {monthly_targets['shyam']}")
        print(f"[BOT] Countdown target set — {COUNTDOWN_TARGET} admissions")
    except:
        print("[BOT] Could not read monthly targets.")

def check_first_of_month():
    """On 1st of every month — remind via WhatsApp and ask in CMD."""
    today = datetime.now()
    if today.day == 1 and today.hour == 10 and today.minute < 2:
        print("[BOT] 1st of month detected — asking for monthly targets.")
        open_chat(PRASHANTH_CONTACT)
        send_message(
            "\U0001f4cb *Monthly Target Reminder*\n"
            "It's the 1st! Please update the monthly admission targets in the bot CMD.\n"
            "Check your terminal now. \U0001f4bb"
        )
        ask_monthly_targets_in_cmd()

# ─────────────────────────────────────────────
#  POSTING LOGIC
# ─────────────────────────────────────────────
def all_weekly_targets_set():
    return bool(weekly_targets["prashanth"] and weekly_targets["shyam"] and weekly_targets["vamsi"])

def post_weekly_scorecard_for_teams(post_p, post_s, post_v, p_closers, s_closers, v_closers):
    if not all_weekly_targets_set():
        print("[BOT] Weekly targets not fully set — skipping scorecard post.")
        return

    monday, sunday = get_week_range()
    counts         = count_weekly_admissions()

    p_msg = build_weekly_scorecard("Prashanth", counts["prashanth"], weekly_targets["prashanth"], monday, sunday, "prashanth", p_closers) if post_p else None
    s_msg = build_weekly_scorecard("Shyam",     counts["shyam"],     weekly_targets["shyam"],     monday, sunday, "shyam",     s_closers) if post_s else None
    v_msg = build_weekly_scorecard("Vamsi",     counts["vamsi"],     weekly_targets["vamsi"],     monday, sunday, "vamsi",     v_closers) if post_v else None

    # Team Prashanth group — Prashanth + Shyam only
    if (post_p or post_s) and open_chat(WHATSAPP_GROUP):
        if p_msg: send_message(p_msg); time.sleep(3)
        if s_msg: send_message(s_msg); time.sleep(3)
        print("[BOT] Weekly scorecards posted to Team Prashanth group.")

    # Upnext group — all 3 scorecards + monthly countdown
    if (post_p or post_s or post_v) and open_chat(UPNEXT_GROUP):
        if p_msg: send_message(p_msg); time.sleep(3)
        if s_msg: send_message(s_msg); time.sleep(3)
        if v_msg: send_message(v_msg); time.sleep(3)
        # Post monthly countdown after scorecards
        countdown_msg = build_monthly_countdown()
        send_message(countdown_msg)
        time.sleep(3)
        print("[BOT] Weekly scorecards + countdown posted to Upnext group.")

def post_monthly_counter():
    if not monthly_targets["prashanth"] and not monthly_targets["shyam"]:
        print("[BOT] Monthly targets not set — skipping monthly counter post.")
        return
    msg = build_monthly_counter()
    if open_chat(WHATSAPP_GROUP):
        send_message(msg)
        print("[BOT] Monthly counter posted to Team Prashanth group.")

# ─────────────────────────────────────────────
#  SHEET POLLING
# ─────────────────────────────────────────────
def poll_sheet_for_new_entries():
    global last_weekly_counts, pending_post
    try:
        counts = count_weekly_admissions()
        p_now  = counts["prashanth"]
        s_now  = counts["shyam"]
        v_now  = counts["vamsi"]

        if last_weekly_counts["prashanth"] == -1:
            last_weekly_counts["prashanth"] = p_now
            last_weekly_counts["shyam"]     = s_now
            last_weekly_counts["vamsi"]     = v_now
            print(f"[BOT] Baseline set — P:{p_now} S:{s_now} V:{v_now}")
            return

        # Never act on count drops — only on increases
        # Drops happen due to transient API errors — ignore them
        p_new = p_now > last_weekly_counts["prashanth"]
        s_new = s_now > last_weekly_counts["shyam"]
        v_new = v_now > last_weekly_counts["vamsi"]

        # If any count dropped — API error, skip this cycle entirely
        if (p_now < last_weekly_counts["prashanth"] or
            s_now < last_weekly_counts["shyam"] or
            v_now < last_weekly_counts["vamsi"]):
            print(f"[BOT] Count drop detected — likely API error. Skipping cycle. P:{p_now} S:{s_now} V:{v_now}")
            return

        if p_new:
            pending_post["prashanth"] = True
            new_p = counts["prashanth_counsellors"][last_weekly_counts["prashanth"]:]
            pending_post["prashanth_closers"].extend(new_p)
            print(f"[BOT] New Prashanth admission! ({last_weekly_counts['prashanth']} -> {p_now}) Closers: {new_p}")
            last_weekly_counts["prashanth"] = p_now

        if s_new:
            pending_post["shyam"] = True
            new_s = counts["shyam_counsellors"][last_weekly_counts["shyam"]:]
            pending_post["shyam_closers"].extend(new_s)
            print(f"[BOT] New Shyam admission! ({last_weekly_counts['shyam']} -> {s_now}) Closers: {new_s}")
            last_weekly_counts["shyam"] = s_now

        if v_new:
            pending_post["vamsi"] = True
            new_v = counts["vamsi_counsellors"][last_weekly_counts["vamsi"]:]
            pending_post["vamsi_closers"].extend(new_v)
            print(f"[BOT] New Vamsi admission! ({last_weekly_counts['vamsi']} -> {v_now}) Closers: {new_v}")
            last_weekly_counts["vamsi"] = v_now

        if (p_new or s_new or v_new) and pending_post["trigger_time"] is None:
            pending_post["trigger_time"] = datetime.now()
            print("[BOT] 5-minute countdown started...")

        if pending_post["trigger_time"] is not None:
            elapsed = (datetime.now() - pending_post["trigger_time"]).total_seconds()
            if elapsed >= 300:
                post_p    = pending_post["prashanth"]
                post_s    = pending_post["shyam"]
                post_v    = pending_post["vamsi"]
                p_closers = list(pending_post["prashanth_closers"])
                s_closers = list(pending_post["shyam_closers"])
                v_closers = list(pending_post["vamsi_closers"])
                pending_post.update({
                    "prashanth": False, "shyam": False, "vamsi": False,
                    "trigger_time": None,
                    "prashanth_closers": [], "shyam_closers": [], "vamsi_closers": []
                })
                post_weekly_scorecard_for_teams(post_p, post_s, post_v, p_closers, s_closers, v_closers)

        if not p_new and not s_new and not v_new:
            print(f"[BOT] No new entries. P:{p_now} S:{s_now} V:{v_now}")

    except Exception as e:
        print(f"[POLL ERROR] {e}")

# ─────────────────────────────────────────────
#  STARTUP CMD INPUT
# ─────────────────────────────────────────────
def startup_cmd_input():
    global weekly_targets
    now        = datetime.now()
    is_monday  = now.weekday() == 0
    past_deadline = now.hour >= 12

    print("\n" + "="*52)
    # Weekly targets
    if is_monday and not past_deadline:
        print("[BOT] Monday before 11am — bot will ask Prashanth, Shyam & Vamsi at 11:00.")
        print("[BOT] Enter weekly targets now if you want (or press Enter to skip):")
        for key, name in [("prashanth","Prashanth"), ("shyam","Shyam"), ("vamsi","Vamsi")]:
            val = input(f"    Team {name} weekly target (Enter to skip): ").strip()
            if val.isdigit():
                weekly_targets[key] = int(val)
    else:
        if is_monday and past_deadline:
            print("[BOT] It is past 12:00 PM on Monday — enter weekly targets manually:")
        else:
            print("[BOT] Not Monday — enter this week's targets manually:")
        for key, name in [("prashanth","Prashanth"), ("shyam","Shyam"), ("vamsi","Vamsi")]:
            val = input(f"    Team {name} weekly target: ").strip()
            weekly_targets[key] = int(val) if val.isdigit() else 0
        print(f"[BOT] Weekly targets — P:{weekly_targets['prashanth']} S:{weekly_targets['shyam']} V:{weekly_targets['vamsi']}")

    # Monthly targets always asked on startup
    print("\n[BOT] Enter monthly targets:")
    ask_monthly_targets_in_cmd()
    print("="*52)

# ─────────────────────────────────────────────
#  SCHEDULER
# ─────────────────────────────────────────────
def setup_schedule():
    schedule.every().monday.at(TARGET_ASK_TIME).do(ask_for_weekly_targets)
    schedule.every().monday.at(TARGET_DEADLINE).do(collect_weekly_targets)
    schedule.every(15).minutes.do(retry_missing_weekly_targets)
    schedule.every(60).seconds.do(poll_sheet_for_new_entries)
    schedule.every().day.at(MONTHLY_POST_AM).do(post_monthly_counter)
    schedule.every().day.at(MONTHLY_POST_PM).do(post_monthly_counter)
    schedule.every().day.at("10:00").do(check_first_of_month)

    print("[BOT] Scheduler ready.")
    print(f"       Monday {TARGET_ASK_TIME}   -> Ask all 3 for weekly targets")
    print(f"       Monday {TARGET_DEADLINE}   -> Read & confirm weekly targets")
    print(f"       Every 15 mins -> Retry missing weekly targets")
    print(f"       Every 60s     -> Poll sheet for new admissions")
    print(f"       {MONTHLY_POST_AM} & {MONTHLY_POST_PM} daily -> Monthly counter to Team Prashanth")
    print(f"       1st of month  -> Monthly target reminder + CMD input")

# ─────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 52)
    print("  WEEKLY ADMISSION TRACKER BOT")
    print("  Phoenix Online Education - Floor 2")
    print("=" * 52)

    init_driver()
    setup_schedule()
    startup_cmd_input()
    poll_sheet_for_new_entries()

    # Post countdown immediately on startup
    print("[BOT] Posting initial countdown to Upnext group...")
    if open_chat(UPNEXT_GROUP):
        send_message(build_monthly_countdown())
        print("[BOT] Countdown posted.")

    print("\n[BOT] Running. Press Ctrl+C to stop.\n")

    while True:
        schedule.run_pending()
        time.sleep(1)
