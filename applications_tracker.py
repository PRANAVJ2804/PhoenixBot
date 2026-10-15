import time
import re
import random
import gspread
import schedule
from datetime import datetime, timedelta
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
SHEET_ID         = "1EPI1eIECYm5DQCBarkmPlwscd6Ycn007Te1tysYIUeI"
SHEET_TAB        = "All Universities applications"
CREDENTIALS_PATH = r"C:\Users\USER\Desktop\whatsapp_bot\credentials.json"
CHROME_PROFILE   = r"C:\Users\USER\Desktop\whatsapp_bot\chrome_session_app"
WHATSAPP_GROUP   = "Team Prashanth"

# Column indices (0-based)
COL_TEAM       = 1   # B
COL_COUNSELLOR = 2   # C
COL_REG_DATE   = 4   # E
COL_ADM_DATE   = 5   # F
COL_LEAD_SRC   = 6   # G
COL_APP_ADM    = 7   # H
COL_CANDIDATE  = 8   # I
COL_PHONE      = 10  # K
COL_EMAIL      = 11  # L
COL_UNIVERSITY = 12  # M
COL_PROGRAM    = 13  # N

# ─────────────────────────────────────────────
#  STATE
# ─────────────────────────────────────────────
last_app_counts    = {"prashanth": -1, "shyam": -1}
last_used_quote    = None

# ─────────────────────────────────────────────
#  MOTIVATION QUOTES — 75 unique English quotes
# ─────────────────────────────────────────────
QUOTES = [
    "🔥 One application closer to the target. Keep the momentum going.",
    "⚡ Every single application counts. Don't slow down now.",
    "🎯 Great work. Now go get the next one.",
    "💪 Applications don't close themselves. You do. Keep going.",
    "🚀 One down. More to go. The grind never stops.",
    "🌟 Consistency is what separates good teams from great ones.",
    "🏆 'Success is the sum of small efforts repeated daily.' Keep repeating.",
    "🔑 Every application is a step forward. Never stop stepping.",
    "💡 'It does not matter how slowly you go, as long as you do not stop.'",
    "🎊 Another one in. The target is getting closer — keep pushing.",
    "⭐ That's how it's done. Now do it again.",
    "🏃 Momentum builds with every application. Don't break it.",
    "💥 'The harder you work, the luckier you get.' Keep working.",
    "🌊 Ride the wave all the way to the target.",
    "🎖️ Every great close starts with a great application. Well done.",
    "🔮 Numbers don't lie. And right now they're saying keep going.",
    "💎 'Hard work beats talent when talent doesn't work hard.'",
    "🦅 This is what focus looks like. Keep soaring.",
    "🌈 'Believe you can and you're halfway there.' Keep believing.",
    "⚡ Small wins build big targets. This is a small win. Celebrate and move.",
    "🎯 'Excellence is not a destination but a continuous journey.' Keep moving.",
    "🔥 Applications today mean admissions tomorrow. Keep filing them.",
    "💪 'Push yourself because no one else is going to do it for you.'",
    "🚀 One more application brings the team one step closer.",
    "🏆 Great teams don't wait for motivation. They create it.",
    "🌟 'Dream big. Work hard. Stay focused.' All three. Right now.",
    "🎊 The target is a promise. Every application is keeping that promise.",
    "💡 Progress is progress no matter how small. Celebrate it.",
    "🔑 'Success usually comes to those who are too busy to be looking for it.'",
    "🏃 Don't count the applications. Make the applications count.",
    "💥 Every application filed is a battle won. Keep winning.",
    "⭐ 'Quality is not an act, it is a habit.' Make applications a habit.",
    "🌊 'Fall seven times, stand up eight.' Keep standing. Keep filing.",
    "🎖️ The scoreboard changes one application at a time.",
    "🔮 'Champions are made in the moments when they want to quit but don't.'",
    "💎 Tough targets need consistent effort. This is that effort.",
    "🦅 'Eagles don't flock — you have to find them one at a time.' Find every lead.",
    "🌈 Every application is proof that this team never gives up.",
    "⚡ 'The comeback is always stronger than the setback.' Keep coming back.",
    "🎯 One application at a time. That's all it takes.",
    "🔥 'Great things never come from comfort zones.' Keep pushing forward.",
    "💪 This is the work that wins. Don't stop doing it.",
    "🚀 'The only way to do great work is to love what you do.' Love the grind.",
    "🏆 Every application filed is a step toward something bigger.",
    "🌟 'It always seems impossible until it's done.' Keep making it done.",
    "🎊 The best time to file an application was yesterday. The next best time is now.",
    "💡 'You don't have to be great to start, but you have to start to be great.'",
    "🔑 Consistent effort over time beats everything. Stay consistent.",
    "🏃 'Pressure makes diamonds.' This team is full of diamonds.",
    "💥 Results come to those who show up. You showed up. Now finish.",
    "⭐ 'Success is not final, failure is not fatal: it is the courage to continue.'",
    "🌊 The target won't come to you. Go to the target.",
    "🎖️ Another application. Another proof that this team means business.",
    "🔮 'The secret of getting ahead is getting started.' You started. Keep going.",
    "💎 Every application filed today is an admission closed tomorrow.",
    "🦅 'Soar high or stay grounded — champions always choose to soar.'",
    "🌈 Don't just meet the target. Exceed it.",
    "⚡ 'You miss 100% of the shots you don't take.' Keep taking shots.",
    "🎯 Filing applications is the job. Closing them is the goal. Do both.",
    "🔥 'The pain of discipline is far less than the pain of regret.'",
    "💪 Well done. Now the real work starts — keep the energy up.",
    "🚀 Application filed. Now follow up. Now close. That's the formula.",
    "🏆 'Believe in yourself and all that you are.' The numbers agree.",
    "🌟 Every application is a seed. Water it. Follow up. Close it.",
    "🎊 'The difference between ordinary and extraordinary is that little extra.'",
    "💡 One application at a time. One target at a time. One team.",
    "🔑 This is what showing up looks like. Keep showing up.",
    "🏃 'It's not whether you get knocked down, it's whether you get up.'",
    "💥 Good things happen to those who work for it. You're working for it.",
    "⭐ 'Do something today that your future self will thank you for.'",
    "🌊 Every application adds to the story this team is writing.",
    "🎖️ Hard work is silent but the numbers speak loud.",
    "🔮 'The only limit to our realization of tomorrow is our doubts of today.'",
    "💎 Application filed. One step closer. Many more to go. Let's go.",
    "🦅 Great work is built one action at a time. This was one action.",
]

def get_quote():
    global last_used_quote
    available = [q for q in QUOTES if q != last_used_quote]
    chosen = random.choice(available if available else QUOTES)
    last_used_quote = chosen
    return chosen

# ─────────────────────────────────────────────
#  GOOGLE SHEETS
# ─────────────────────────────────────────────
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly"
]

def get_sheet_data():
    for attempt in range(3):
        try:
            creds  = Credentials.from_service_account_file(CREDENTIALS_PATH, scopes=SCOPES)
            client = gspread.authorize(creds)
            sheet  = client.open_by_key(SHEET_ID).worksheet(SHEET_TAB)
            return sheet.get_all_values()
        except Exception as e:
            print(f"[SHEET ERROR] Attempt {attempt+1}/3: {e}")
            time.sleep(5)
    return []

def get_week_range():
    today  = datetime.now().date()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday

def parse_date(date_str):
    for fmt in ["%d/%m/%Y", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d-%m-%Y", "%m/%d/%Y"]:
        try:
            return datetime.strptime(str(date_str).strip(), fmt).date()
        except:
            continue
    return None

def count_monthly_applications_for_team(team_name):
    """Count ALL App rows for a team in the current month."""
    rows      = get_sheet_data()
    today     = datetime.now().date()
    month     = today.month
    year      = today.year
    count     = 0
    for row in rows:
        if len(row) < 8:
            continue
        team    = row[COL_TEAM].strip().lower()    if len(row) > COL_TEAM else ""
        app_adm = row[COL_APP_ADM].strip().lower() if len(row) > COL_APP_ADM else ""
        reg_date = row[COL_REG_DATE].strip()       if len(row) > COL_REG_DATE else ""
        if app_adm != "app":
            continue
        if team != team_name.lower():
            continue
        parsed = parse_date(reg_date)
        if parsed and parsed.month == month and parsed.year == year:
            count += 1
    return count

def count_weekly_applications():
    """Count App rows for Prashanth and Shyam this week."""
    rows             = get_sheet_data()
    monday, sunday   = get_week_range()
    p_count          = 0
    s_count          = 0
    p_apps           = []
    s_apps           = []

    for row in rows:
        if len(row) < 9:
            continue
        team     = row[COL_TEAM].strip().lower()    if len(row) > COL_TEAM else ""
        app_adm  = row[COL_APP_ADM].strip().lower() if len(row) > COL_APP_ADM else ""
        reg_date = row[COL_REG_DATE].strip()        if len(row) > COL_REG_DATE else ""

        if app_adm != "app":
            continue
        if team not in ["prashanth", "shyam"]:
            continue

        parsed = parse_date(reg_date)
        if not parsed or not (monday <= parsed <= sunday):
            continue

        entry = {
            "team":       row[COL_TEAM].strip(),
            "counsellor": row[COL_COUNSELLOR].strip() if len(row) > COL_COUNSELLOR else "",
            "candidate":  row[COL_CANDIDATE].strip()  if len(row) > COL_CANDIDATE else "",
            "university": row[COL_UNIVERSITY].strip() if len(row) > COL_UNIVERSITY else "",
            "program":    row[COL_PROGRAM].strip()    if len(row) > COL_PROGRAM else "",
            "phone":      row[COL_PHONE].strip()      if len(row) > COL_PHONE else "",
        }

        if team == "prashanth":
            p_count += 1
            p_apps.append(entry)
        elif team == "shyam":
            s_count += 1
            s_apps.append(entry)

    return {
        "prashanth": p_count,
        "shyam":     s_count,
        "prashanth_apps": p_apps,
        "shyam_apps":     s_apps,
        "total_rows": len(rows)
    }

# ─────────────────────────────────────────────
#  SCORECARD BUILDER
# ─────────────────────────────────────────────
def build_app_report(team_name, done, latest_app):
    month_str = datetime.now().strftime("%B %Y")
    monthly   = count_monthly_applications_for_team(team_name)
    line      = "\u2501" * 20

    msg = (
        f"\U0001f4cb NEW APPLICATION \u2014 TEAM {team_name.upper()}\n"
        f"{line}\n"
        f"\U0001f464 Candidate   :  {latest_app.get('candidate', '')}\n"
        f"\n"
        f"\U0001f468\u200d\U0001f4bc Counsellor :  {latest_app.get('counsellor', '')}\n"
        f"{line}\n"
        f"\U0001f4c5 {month_str}\n"
        f"\U0001f4cb Total Apps This Month  :  *{monthly}*\n"
        f"{line}"
    )
    return msg

# ─────────────────────────────────────────────
#  SELENIUM — ATTACH TO EXISTING CHROME
# ─────────────────────────────────────────────
chrome_options = Options()
chrome_options.add_argument(f"user-data-dir={CHROME_PROFILE}")
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
    print("[BOT] Waiting for WhatsApp Web...")
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
        text_box = wait.until(EC.presence_of_element_located(
            (By.XPATH, '//div[@contenteditable="true"][@data-tab="10"]')
        ))
        text_box.click()
        time.sleep(0.5)
        webdriver.ActionChains(driver).key_down(Keys.CONTROL).send_keys('v').key_up(Keys.CONTROL).perform()
        time.sleep(1)
        text_box = driver.find_element(By.XPATH, '//div[@contenteditable="true"][@data-tab="10"]')
        text_box.send_keys(Keys.ENTER)
        time.sleep(2)
        print("[BOT] Message sent.")
    except Exception as e:
        print(f"[SEND ERROR] {e}")

# ─────────────────────────────────────────────
#  POLLING
# ─────────────────────────────────────────────
# Pending post tracker with 5-min delay
pending_app_post = {
    "prashanth": False, "shyam": False,
    "trigger_time": None,
    "prashanth_latest": {}, "shyam_latest": {}
}

def poll_for_new_applications():
    global last_app_counts, pending_app_post

    try:
        data  = count_weekly_applications()
        p_now = data["prashanth"]
        s_now = data["shyam"]

        # Baseline
        if last_app_counts["prashanth"] == -1:
            last_app_counts["prashanth"] = p_now
            last_app_counts["shyam"]     = s_now
            print(f"[BOT] Baseline set — P:{p_now} S:{s_now}")
            return

        # Skip on drops (API error)
        if p_now < last_app_counts["prashanth"] or s_now < last_app_counts["shyam"]:
            print(f"[BOT] Count drop — skipping. P:{p_now} S:{s_now}")
            return

        p_new = p_now > last_app_counts["prashanth"]
        s_new = s_now > last_app_counts["shyam"]

        if p_new:
            pending_app_post["prashanth"] = True
            pending_app_post["prashanth_latest"] = data["prashanth_apps"][-1] if data["prashanth_apps"] else {}
            print(f"[BOT] New Prashanth app! ({last_app_counts['prashanth']} → {p_now}). Waiting 5 mins...")
            last_app_counts["prashanth"] = p_now

        if s_new:
            pending_app_post["shyam"] = True
            pending_app_post["shyam_latest"] = data["shyam_apps"][-1] if data["shyam_apps"] else {}
            print(f"[BOT] New Shyam app! ({last_app_counts['shyam']} → {s_now}). Waiting 5 mins...")
            last_app_counts["shyam"] = s_now

        # Start 5-min countdown on first detection
        if (p_new or s_new) and pending_app_post["trigger_time"] is None:
            pending_app_post["trigger_time"] = datetime.now()

        # Check if 5 minutes passed
        if pending_app_post["trigger_time"] is not None:
            elapsed = (datetime.now() - pending_app_post["trigger_time"]).total_seconds()
            if elapsed >= 300:
                post_p = pending_app_post["prashanth"]
                post_s = pending_app_post["shyam"]
                p_latest = pending_app_post["prashanth_latest"]
                s_latest = pending_app_post["shyam_latest"]

                # Reset
                pending_app_post["prashanth"]         = False
                pending_app_post["shyam"]             = False
                pending_app_post["trigger_time"]      = None
                pending_app_post["prashanth_latest"]  = {}
                pending_app_post["shyam_latest"]      = {}

                # Re-read latest counts after 5 mins
                fresh = count_weekly_applications()

                if post_p:
                    msg = build_app_report("Prashanth", fresh["prashanth"], p_latest)
                    if open_chat(WHATSAPP_GROUP):
                        send_message(msg)
                    print("[BOT] Prashanth app report posted.")

                if post_s:
                    msg = build_app_report("Shyam", fresh["shyam"], s_latest)
                    if open_chat(WHATSAPP_GROUP):
                        send_message(msg)
                    print("[BOT] Shyam app report posted.")

        if not p_new and not s_new:
            print(f"[BOT] No new apps. P:{p_now} S:{s_now}")

    except Exception as e:
        print(f"[POLL ERROR] {e}")

# ─────────────────────────────────────────────
#  STARTUP CMD
# ─────────────────────────────────────────────
def reset_counts_monday():
    if datetime.now().weekday() != 0:
        return
    last_app_counts["prashanth"] = -1
    last_app_counts["shyam"]     = -1
    print("[BOT] Monday reset — counts reset for new week.")

# ─────────────────────────────────────────────
#  DAILY PENDING REPORT
# ─────────────────────────────────────────────


# ─────────────────────────────────────────────
#  SCHEDULER
# ─────────────────────────────────────────────
def setup_schedule():
    schedule.every(60).seconds.do(poll_for_new_applications)
    schedule.every().monday.at("11:00").do(reset_counts_monday)
    print("[BOT] Scheduler ready.")
    print("       Every 60s          → Poll for new applications")
    print("       Monday 11:00       → Reset counts for new week")
    print("       10:30, 15:00, 18:30 → Daily pending report to Team Prashanth")

# ─────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 52)
    print("  📋 APPLICATION TRACKER BOT")
    print("  Phoenix Online Education — Floor 2")
    print("=" * 52)

    init_driver()
    setup_schedule()
    poll_for_new_applications()

    print("\n[BOT] Running. Press Ctrl+C to stop.\n")

    while True:
        schedule.run_pending()
        time.sleep(1)
