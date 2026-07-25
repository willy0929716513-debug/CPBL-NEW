"""全域設定值：資料來源網址、儲存路徑、HTTP 參數等。

集中放在這裡是為了：當官網改版、換網址、或要調整節流秒數時，
只需要動這一個檔案，不用去每個 scraper 裡面找散落的常數。
"""
from __future__ import annotations

from pathlib import Path

# ---------------------------------------------------------------------------
# 目錄
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "cpbl.db"
FIXTURES_DIR = BASE_DIR / "cpbl_analytics" / "tests" / "fixtures"

DATA_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# 資料來源（中華職棒官網）
# ---------------------------------------------------------------------------
# 注意：官網會不定期改版，若欄位對不上，scraper 會直接拋出
# ParsingError 而不是默默塞進錯誤的欄位，方便你第一時間發現改版。
BASE_URL = "https://www.cpbl.com.tw"

URLS = {
    "standings": f"{BASE_URL}/standings/season",       # 球隊戰績
    "record_all": f"{BASE_URL}/stats/recordall",        # 全記錄查詢（打擊/投手/守備）
    "toplist": f"{BASE_URL}/stats/toplist",              # 單項排行榜
    "schedule": f"{BASE_URL}/schedule",                  # 賽程
    "box": f"{BASE_URL}/box",                            # 成績看板 / 戰報
}

# 目前 CPBL 使用的球隊（可依球季調整；歷史球隊名稱異動見 README）
TEAM_NAMES = [
    "中信兄弟",
    "統一7-ELEVEn獅",
    "樂天桃猿",
    "富邦悍將",
    "台鋼雄鷹",
    "味全龍",
]

# ---------------------------------------------------------------------------
# HTTP 參數
# ---------------------------------------------------------------------------
REQUEST_TIMEOUT = 15  # 秒
REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; CPBLAnalyticsBot/0.1; "
        "+for-personal-analysis-use)"
    ),
    "Accept-Language": "zh-TW,zh;q=0.9",
}
# 對同一主機兩次請求間至少間隔幾秒，避免對官網造成負擔
MIN_REQUEST_INTERVAL_SECONDS = 1.5
MAX_RETRIES = 3
