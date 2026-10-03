# Pathlight — AI 讀書教練

一個 AI 學習/考試準備工具：上傳筆記、課本、簡報或考古題照片，AI 幫你規劃個人化讀書計畫，
並提供導讀課程、主題 Podcast、Flashcards、互動測驗、模擬筆試、模擬口試、拍照解題。

功能參考 Astra AI（一款真實存在的學習 App）公開介紹的功能範圍打造，但使用原創的品牌名稱、
介面設計——不是那款 App 的複製品。

## 技術架構

- **Next.js 16**（App Router）+ TypeScript + Tailwind CSS
- **Anthropic Claude API**（`claude-sonnet-5-5`）：負責所有 AI 功能——分析教材、規劃讀書
  計畫、出題、批改、解題。統一包在 `lib/claude.ts`，用 tool use 強制回傳結構化 JSON。
- **瀏覽器內建 Web Speech API**：Podcast 朗讀（SpeechSynthesis）跟模擬口試的語音辨識
  （SpeechRecognition），不用另外申請 TTS/STT 服務的金鑰。SpeechRecognition 目前主要在
  Chrome／Edge 系列瀏覽器可用，不支援的瀏覽器會自動退回文字輸入。
- **IndexedDB**（透過 `idb` 套件）：所有學習資料都存在瀏覽器本機，**沒有帳號系統、沒有雲端
  同步**——這是刻意的設計取捨，先把核心學習功能做完整，多人帳號系統之後可以再加。換瀏覽器、
  換裝置、清瀏覽器資料都會讓紀錄消失。

## 設定與啟動

```bash
npm install

# 申請一組 Claude API 金鑰：https://platform.claude.com
cp .env.example .env.local
# 編輯 .env.local，填入 ANTHROPIC_API_KEY=sk-ant-...

npm run dev
```

開啟 http://localhost:3000。

## 專案結構

```
app/
├── page.tsx                          # 首頁：教材列表
├── upload/page.tsx                   # 上傳教材 → AI 分析 → 產生讀書計畫
├── solve/page.tsx                    # 拍照解題（獨立功能，不綁定特定教材）
├── materials/[id]/
│   ├── page.tsx                      # 單一教材的功能入口 + 讀書計畫進度
│   ├── lesson/page.tsx               # 導讀課程
│   ├── podcast/page.tsx              # 主題 Podcast（含語音朗讀）
│   ├── flashcards/page.tsx           # 學習卡
│   ├── quiz/page.tsx                 # 互動小測驗
│   └── exam/
│       ├── written/page.tsx          # 模擬筆試
│       └── oral/page.tsx             # 模擬口試（含語音辨識）
└── api/                              # 每個 AI 功能各自一個 route，呼叫 lib/claude.ts
    ├── analyze/、lesson/、podcast/、flashcards/、quiz/、solve/
    └── exam/written/、exam/written/grade/、exam/oral/questions/、exam/oral/grade/

lib/
├── claude.ts        # Claude API 串接層，每個 AI 功能一個函式，統一用 tool use 拿結構化輸出
├── db.ts             # IndexedDB 資料層（教材、讀書計畫進度、學習卡、測驗、考試紀錄）
├── speech.ts          # Web Speech API 包裝（朗讀 + 語音辨識）
├── api-client.ts       # 前端呼叫 /api/* 的共用工具、檔案讀取（base64/文字）
└── api-handler.ts      # API route 共用的錯誤處理包裝
```

## 已知限制

- **沒有帳號系統**：所有資料存在單一瀏覽器的 IndexedDB，不會跨裝置同步，清瀏覽器資料會
  遺失全部紀錄。
- **語音辨識瀏覽器支援度**：模擬口試的語音輸入仰賴瀏覽器的 SpeechRecognition API，Safari／
  Firefox 支援不完整，不支援時會自動顯示文字輸入框讓使用者改用打字作答。
- **上傳檔案格式**：目前只接受純文字 (.txt)、PDF、圖片（jpg/png/gif/webp）；PDF 直接整份
  送給 Claude 的 document 功能解析，不會在前端另外做文字擷取。
- **這個 repo 的沙盒開發環境連不到外部網路**，所以 Claude API 的呼叫從來沒有在開發過程中
  真的被呼叫測試過——所有功能的驗證方式是用 Playwright 攔截 `/api/*` 的網路請求、回傳模擬
  資料，驅動整個使用者流程（上傳 → 讀書計畫 → 導讀課程 → Podcast → 學習卡 → 測驗作答 →
  模擬筆試批改 → 模擬口試 → 拍照解題 → 回到首頁確認教材列表），確認前端邏輯、狀態管理、
  UI 互動都正確，瀏覽器主控台沒有任何錯誤。**第一次接上真正的 Claude API 金鑰時，請實際
  跑過一次每個功能**，確認 AI 回傳的內容格式跟預期一致（尤其是 tool use 的 JSON schema）。
