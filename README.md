# CPBL-NEW ⚾ 中華職棒數據分析平台

一個以「職業分析師」角度打造的中華職棒（CPBL）數據分析工具：從官網爬取球隊戰績、
打者/投手數據、賽程戰報，做**交叉驗證**確保數字正確，計算進階數據指標（wOBA 近似值、
FIP 近似值、畢氏勝率期望值...），並提供 Streamlit 網頁版儀表板瀏覽。

## ⚠️ 重要：關於資料正確性與目前環境限制

這支程式最重要的設計原則是「**先假設抓到的資料是錯的，直到驗證證明它是對的**」：

- **爬蟲不用位置索引讀欄位，只用表頭文字比對**（`scraper/parsing_utils.py`）。
  官網改版、欄位順序調換時，程式會直接丟出 `ParsingError`，而不是安靜地把資料
  塞進錯的欄位。
- **每一個衍生指標都會重新計算一次來交叉驗證**（`validation.py`）：打擊率、上壘率、
  長打率、OPS、防禦率、WHIP，全部用最基礎的欄位（安打、打數、局數、自責分...）
  重新算過，跟官網顯示的數字比對，對不上就標記為警告或錯誤。
- **所有驗證結果都存進資料庫、攤在網頁版「資料驗證」分頁**，不是只告訴你「爬蟲成功」
  四個字。

**目前這個開發環境（sandbox）對外網路被基礎設施層擋掉**（包含
`www.cpbl.com.tw`、`stats.cpbl.com.tw` 在內的所有外部網域，經測試連 DNS/TLS
CONNECT 都被 proxy 直接 403 拒絕），所以爬蟲程式**無法在這個環境裡實際連上官網跑一次**。
為了在無網路的狀況下，仍然證明「parser 的解析邏輯」跟「validation 的交叉驗證公式」
本身是正確的，本專案採用以下作法：

1. `cpbl_analytics/tests/fixtures/*.html` 放了人工設計、但數字邏輯完全自洽的
   模擬官網表格（例如打擊率確實等於安打/打數），`pytest` 針對這些 fixture 驗證
   parser 與驗證公式的正確性（23 項測試全數通過，見下方「已完成的驗證」）。
2. `scraper/schedule.py` 用的 CSS selector（`.game`, `.team_name` 等）是**佔位、
   儘量通用的猜測**，因為賽程頁面版面多變、且無法在此環境連線確認實際結構。
   **第一次在有網路的環境執行 `cli scrape` 時，請務必檢查`資料驗證`頁面的結果**，
   若 selector 對不上官網目前版面，需要打開瀏覽器「檢視原始碼」核對後更新
   `schedule.py` 裡的常數。
3. `standings.py` / `batting.py` / `pitching.py` 用的表頭別名（例如「打擊率」/「AVG」）
   涵蓋了官網歷年常見的中英文寫法，但同樣建議第一次執行後檢查驗證頁面結果。

**換句話說：程式的「邏輯正確性」已經過測試證明，但「跟官網目前實際 HTML 結構
是否完全吻合」需要你在有網路的環境跑第一次 `cli scrape` 後，靠內建的驗證機制確認。**
這正是為什麼「資料驗證」是網頁版的第一等公民分頁，而不是事後才加的除錯工具。

## 快速開始

```bash
# 1. 安裝相依套件
pip install -r requirements.txt

# 2. 先跑測試，確認 parser / 驗證邏輯本身沒問題（不需要網路）
pytest cpbl_analytics/tests -v

# 3. 在「有網路」的環境，實際對官網跑一次爬蟲 + 驗證 + 寫入資料庫
python -m cpbl_analytics.cli scrape --year 2026

# 4. 啟動網頁版
streamlit run cpbl_analytics/app/Home.py
```

啟動後開啟瀏覽器 `http://localhost:8501`，左側導覽列可切換：

| 分頁 | 內容 |
|---|---|
| Home | 總覽、關鍵指標卡片 |
| 球隊戰績 | 戰績表、勝率長條圖、畢氏勝率期望值（實際 vs 理論） |
| 打者排行榜 | 完整打擊數據、可依球隊/最低打數篩選、進階指標（wOBA近似/ISO/BB%/K%）、Top 10 |
| 投手排行榜 | 完整投球數據、進階指標（FIP近似/K-9/BB-9）、Top 10 |
| 球隊比較 | 任選 2+ 支球隊，雷達圖 + 詳細數據對照 |
| 賽程與戰報 | 近期賽果 |
| **資料驗證** | 每次爬蟲執行的完整交叉驗證結果，判斷資料是否可信的依據 |

## 專案結構

```
cpbl_analytics/
├── config.py              # 資料來源網址、HTTP 參數等全域設定
├── validation.py          # 資料驗證：交叉檢查所有衍生指標與邏輯一致性
├── sabermetrics.py         # 進階數據：wOBA/FIP 近似值、畢氏勝率、球隊加總
├── storage.py              # SQLite 儲存層（每次爬蟲存一份帶時間戳記的快照）
├── cli.py                  # 命令列工具：一鍵爬蟲 + 驗證 + 寫入資料庫
├── scraper/
│   ├── http.py              # 共用 HTTP 存取層：節流、重試、例外型別
│   ├── parsing_utils.py     # 表格解析核心：用表頭文字而非欄位位置比對
│   ├── standings.py         # 球隊戰績 scraper
│   ├── batting.py           # 打者「全記錄查詢」scraper
│   ├── pitching.py          # 投手「全記錄查詢」scraper（含 12.1 局數記號正確轉換）
│   └── schedule.py          # 賽程與戰報 scraper
├── app/
│   ├── Home.py               # Streamlit 入口頁
│   ├── utils.py              # 網頁版共用工具：資料快取、配色
│   └── pages/                # Streamlit 多頁面（左側導覽列自動產生）
└── tests/
    ├── fixtures/              # 離線測試用的模擬官網 HTML
    ├── test_scraper_parsing.py
    ├── test_validation.py
    └── test_sabermetrics.py
```

## 資料庫

預設使用 SQLite（`data/cpbl.db`，已加進 `.gitignore` 不會進版控）。每次執行
`cli scrape` 會新增一批帶時間戳記的快照（而不是覆蓋），方便之後做「戰績隨球季
變化」之類的歷史趨勢分析，也讓你可以在某次爬蟲驗證沒過時，回頭比對上一次
成功的快照。

## 進階指標的計算方式與已知近似

- **wOBA 近似值**：採用 Tom Tango《The Book》公開的簡化權重，**未依 CPBL 逐年
  得分環境校正**，適合球員間相對排序，不建議直接跟 MLB 官方 wOBA 數值比較絕對大小。
- **FIP 近似值**：採用常見預設常數 3.10，嚴謹分析應改用該球季 CPBL 聯盟平均
  防禦率反推專屬常數。
- **畢氏勝率期望值**：Bill James 公式，指數採 Pythagenpat 常見的 1.83，
  球隊得失分則是加總自 `batting_stats.runs`（得分）與 `pitching_stats.runs_allowed`
  （投手被得分），理論上等同官方球隊得失分。

## 已完成的驗證

```
pytest cpbl_analytics/tests -v
# 23 passed
```

涵蓋：表頭比對解析（含官網改版模擬情境會正確拋出錯誤）、投手局數記號
（`12.1` = 12又1/3局）正確轉換、打擊率/上壘率/長打率/OPS/防禦率/WHIP 交叉驗證、
以及故意塞入矛盾數據（如安打數超過打數）確認驗證機制真的抓得到問題。

Streamlit 網頁版亦已用 `streamlit.testing.v1.AppTest` 對全部 7 個頁面做過
無例外執行測試，並用瀏覽器截圖確認實際版面（表格、圖表、篩選器、雷達圖）
正常渲染。

## 免責聲明

本工具僅供個人研究與數據分析使用，請遵守中華職棒官網的服務條款，並注意
`config.py` 中的 `MIN_REQUEST_INTERVAL_SECONDS` 節流設定，不要對官網發送
過於頻繁的請求。
