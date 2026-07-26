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
是否完全吻合」需要在有網路的環境跑第一次爬蟲後，靠內建的驗證機制確認。**
這正是為什麼「資料驗證」是網頁版的第一等公民分頁，而不是事後才加的除錯工具。

## 🚀 全自動雲端版（推薦：不用自己開電腦，資料自動更新）

整套流程設計成「爬蟲跑在 GitHub 的雲端伺服器上、網頁也部署在雲端」，你只需要
**設定一次**，之後資料就會自動更新，完全不需要再打開自己的電腦：

```
GitHub Actions（排程，每天自動跑）
   └─ 執行 cli scrape → 驗證 → 匯出 data/latest/*.csv + validation_summary.json
        └─ 自動 commit 回這個 repo
             └─ Streamlit Community Cloud 偵測到 repo 有新的 commit
                  └─ 自動重新讀取最新資料，網頁跟著更新
```

### 設定步驟（只需要做一次）

**1. 打開 repo 的 Actions 寫入權限**（讓排程爬蟲抓完資料後，能把結果 commit 回 repo）

前往 GitHub 上這個 repo → `Settings` → 左側 `Actions` → `General` → 拉到最下面
`Workflow permissions` → 選 **`Read and write permissions`** → `Save`。這是
GitHub 的預設安全限制，只有你（repo 擁有者）能改，我這邊沒有權限幫你點。

**2. 手動觸發一次爬蟲，確認整條流程沒問題**

repo 上方 `Actions` 分頁 → 左側選 **「定期更新 CPBL 資料」** → 右上角
**`Run workflow`** 按鈕 → 直接按下去。等 1~2 分鐘，工作列表會出現一個綠色打勾
（代表成功、資料已經 commit 回 repo）或紅色叉叉（代表失敗，通常是官網結構
跟程式預期的不一樣，點進去看 log，或參考下面「常見問題」）。

之後這個 workflow 會照 `.github/workflows/scrape.yml` 裡設定的排程
（預設每天台北時間凌晨 4 點）自動執行，你也隨時可以回到 Actions 分頁按
`Run workflow` 立刻手動更新一次，**全程不用開自己的電腦、不用裝 Python**。

**3. 部署網頁版到 Streamlit Community Cloud**（免費，直接連 GitHub repo）

1. 開 https://share.streamlit.io，用你的 GitHub 帳號登入
2. 「New app」→ Repository 選這個 repo、Branch 選 `main`
3. Main file path 填：`cpbl_analytics/app/Home.py`
4. 按 Deploy，等一兩分鐘會拿到一個公開網址（例如 `xxx.streamlit.app`），
   之後這個網址就是你平常看數據用的網頁

部署好之後，**每次 GitHub Actions 排程跑完、把新資料 commit 回 repo，
Streamlit Cloud 會自動偵測到並重新整理**，網頁上的資料就會自動更新，
不需要你手動重新部署，也不需要重新輸入網址。

### 之後的日常使用

- 平常就是直接開那個 `xxx.streamlit.app` 網址看資料，跟開一般網站一樣。
- 想馬上要最新資料、不想等排程時間到：去 GitHub 的 Actions 分頁按一次
  `Run workflow`，等它跑完（1~2 分鐘）網頁就會有新資料。
- 想改自動更新的頻率（例如改成一天兩次、或改成每週一次）：編輯
  `.github/workflows/scrape.yml` 裡 `cron: "0 20 * * *"` 這一行即可
  （cron 語法是「分 時 日 月 星期」，目前設定是 UTC 20:00 = 台北時間隔天 04:00）。
- 想知道最新一次資料到底有沒有通過驗證：網頁版左側「資料驗證」分頁，
  或直接在 GitHub 上打開 `data/latest/validation_summary.json` 這個檔案看。

## 本機開發 / 除錯用（進階）

如果你想在自己電腦上跑（例如要修改 `schedule.py` 裡的 CSS selector、
或想在本機先測試），流程如下：

```bash
# 1. 安裝相依套件
pip install -r requirements.txt

# 2. 先跑測試，確認 parser / 驗證邏輯本身沒問題（不需要網路）
pytest cpbl_analytics/tests -v

# 3. 在「有網路」的環境，實際對官網跑一次爬蟲 + 驗證 + 寫入資料庫，並匯出 data/latest/ 快照
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
.github/workflows/scrape.yml   # GitHub Actions 排程：定期跑爬蟲、commit 最新快照
cpbl_analytics/
├── config.py              # 資料來源網址、HTTP 參數等全域設定
├── validation.py          # 資料驗證：交叉檢查所有衍生指標與邏輯一致性
├── sabermetrics.py         # 進階數據：wOBA/FIP 近似值、畢氏勝率、球隊加總
├── storage.py              # SQLite 儲存層（本機用，累積歷史快照，不進版控）
├── latest_export.py         # 匯出/讀取 data/latest/ 的 CSV+JSON（會進版控，雲端版靠這個）
├── cli.py                  # 命令列工具：一鍵爬蟲 + 驗證 + 寫入資料庫 + 匯出快照
├── scraper/
│   ├── http.py              # 共用 HTTP 存取層：節流、重試、例外型別
│   ├── parsing_utils.py     # 表格解析核心：用表頭文字而非欄位位置比對
│   ├── standings.py         # 球隊戰績 scraper
│   ├── batting.py           # 打者「全記錄查詢」scraper
│   ├── pitching.py          # 投手「全記錄查詢」scraper（含 12.1 局數記號正確轉換）
│   └── schedule.py          # 賽程與戰報 scraper
├── app/
│   ├── Home.py               # Streamlit 入口頁
│   ├── utils.py              # 網頁版共用工具：資料載入（CSV 優先、sqlite 備援）、配色
│   └── pages/                # Streamlit 多頁面（左側導覽列自動產生）
└── tests/
    ├── fixtures/              # 離線測試用的模擬官網 HTML
    ├── test_scraper_parsing.py
    ├── test_validation.py
    └── test_sabermetrics.py
```

## 資料怎麼存、怎麼讀（兩層設計）

1. **`data/latest/`（會進版控，雲端版靠這個）**：每次 `cli scrape` 跑完，
   只保留「最新一次」的快照，匯出成體積小、對 git 友善的 CSV
   （`standings.csv` / `batting.csv` / `pitching.csv` / `schedule.csv`）
   跟一份 `validation_summary.json`。GitHub Actions 排程爬完就是把這幾個
   檔案 commit 回 repo；網頁版（不管本機還是 Streamlit Cloud）都優先讀這裡。
   因為檔案小、內容一目了然，你也可以直接在 GitHub 網頁上點開這些檔案看。
2. **`data/cpbl.db`（本機用，已加進 `.gitignore`，不會進版控）**：SQLite
   資料庫，每次執行 `cli scrape` 會新增一批帶時間戳記的完整歷史快照
   （而不是覆蓋），方便在本機做「戰績隨球季變化」之類的歷史趨勢分析。
   刻意不進版控，是因為這個檔案會隨時間無限累積、不適合放進 git 歷史。

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
無例外執行測試（包含模擬「全新雲端部署、完全沒有本機 sqlite、只有
`data/latest/` CSV」的情境），並用瀏覽器截圖確認實際版面（表格、圖表、
篩選器、雷達圖）正常渲染。

## 常見問題

**Q: GitHub Actions 的「定期更新 CPBL 資料」跑出紅色叉叉（失敗）**
點進那次執行的 log 看是哪一步失敗：
- 如果訊息是 `回傳狀態碼 404`：`scraper/http.py` 已經會自動在
  `www.cpbl.com.tw` / `cpbl.com.tw`（有無 www.）兩種網址間自動切換一次，
  如果兩種都 404，代表官網把這個頁面的路徑整個改掉了（不只是 www 差異），
  需要打開瀏覽器實際確認現在正確的網址，回報給我更新 `config.py` 的 `URLS`。
- 如果是「執行爬蟲與資料驗證」這步失敗且訊息是 `ParsingError`，代表官網
  改版、欄位表頭或賽程頁 CSS selector 跟程式預期的對不上，需要更新
  `cpbl_analytics/scraper/` 裡對應的檔案（見上面「已知限制」）。這種錯誤
  訊息會直接附上「實際表頭」跟「一小段原始 HTML」，把完整錯誤訊息複製
  貼給我就能直接修，不需要自己動手改程式碼。
- 如果是「提交更新後的資料快照」這步失敗，通常是 Settings → Actions →
  General → Workflow permissions 還沒設成 `Read and write permissions`
  （見「全自動雲端版」設定步驟第 1 步）。

**Q: Streamlit Cloud 上的網頁一直顯示「尚未有資料」**
代表 GitHub Actions 還沒成功執行過一次。去 repo 的 Actions 分頁確認
「定期更新 CPBL 資料」是否至少成功跑過一次（綠色打勾），沒有的話手動按
`Run workflow` 觸發一次。

**Q: 想指定不同球季年度**
`.github/workflows/scrape.yml` 裡 `run: python -m cpbl_analytics.cli scrape`
可以加上 `--year 2025` 之類的參數。

**Q: 想調整自動更新頻率**
編輯 `.github/workflows/scrape.yml` 裡的 `cron` 那一行即可，不需要碰任何
Python 程式碼。

## 免責聲明

本工具僅供個人研究與數據分析使用，請遵守中華職棒官網的服務條款，並注意
`config.py` 中的 `MIN_REQUEST_INTERVAL_SECONDS` 節流設定，不要對官網發送
過於頻繁的請求。
