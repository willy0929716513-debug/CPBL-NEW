"""共用的 HTTP 存取層：重試、節流、統一的錯誤型別。

所有 scraper 都透過這裡發送請求，不要在個別 scraper 裡面自己呼叫
requests.get()，理由：
1. 節流（MIN_REQUEST_INTERVAL_SECONDS）要全域套用，不是每個 scraper 各管各的。
2. 重試 / 例外轉換的邏輯只寫一次。
3. 之後如果要換成 Playwright（例如進階數據站是 JS 動態渲染），
   只要在這一層加一個 fetch_rendered()，呼叫端完全不用改。
"""
from __future__ import annotations

import time

import requests
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from cpbl_analytics.config import (
    MAX_RETRIES,
    MIN_REQUEST_INTERVAL_SECONDS,
    REQUEST_HEADERS,
    REQUEST_TIMEOUT,
)


class FetchError(Exception):
    """網路層或 HTTP 狀態碼異常。"""


class ParsingError(Exception):
    """HTML 結構跟預期不符（例如官網改版、欄位標題變了）。

    刻意跟 FetchError 分開，讓呼叫端可以判斷「連不到官網」跟
    「連得到，但抓到的內容格式跟預期不一樣」是兩種不同問題。
    """


_last_request_time: dict[str, float] = {}


def _throttle(host: str) -> None:
    last = _last_request_time.get(host)
    if last is not None:
        elapsed = time.monotonic() - last
        wait = MIN_REQUEST_INTERVAL_SECONDS - elapsed
        if wait > 0:
            time.sleep(wait)
    _last_request_time[host] = time.monotonic()


def _swap_www(url: str) -> str:
    """把網址的 host 在「有 www.」跟「沒有 www.」之間互換。"""
    if "://www." in url:
        return url.replace("://www.", "://", 1)
    return url.replace("://", "://www.", 1)


@retry(
    reraise=True,
    stop=stop_after_attempt(MAX_RETRIES),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type(FetchError),
)
def get_html(url: str, *, params: dict | None = None) -> str:
    """抓取一個網頁的 HTML 原始碼，含節流與重試。

    如果目前這個網址回傳 404，會自動改試「有無 www.」的另一個變體再試一次
    ——CPBL 官網 www / 非 www 兩個網域，過去觀察到不一定每個路徑都同時
    存在（例如其中一個網域只有首頁能連，深層路徑會 404），與其要求每次
    改版都手動猜測、調整設定檔，不如讓爬蟲自己多試一種寫法。

    Raises:
        FetchError: 兩種網址變體都連不上或回傳非 2xx 狀態碼（重試 MAX_RETRIES 次後仍失敗）。
    """
    resp = _request(url, params=params)
    if resp.status_code == 404:
        alt_url = _swap_www(url)
        alt_resp = _request(alt_url, params=params)
        if alt_resp.status_code == 200:
            alt_resp.encoding = alt_resp.apparent_encoding or "utf-8"
            return alt_resp.text
        # 兩種都失敗的話，錯誤訊息仍然報告原本要求的那個網址，比較好追查設定檔。

    if resp.status_code != 200:
        raise FetchError(f"{url} 回傳狀態碼 {resp.status_code}\n{_diagnose_response(resp)}")

    resp.encoding = resp.apparent_encoding or "utf-8"
    return resp.text


def _diagnose_response(resp: requests.Response) -> str:
    """把回應的關鍵標頭跟一小段內容附進錯誤訊息。

    404／403 這類狀態碼有兩種完全不同的可能：官網真的把這個頁面拿掉了，
    或者是前面擋了一層 CDN／WAF（例如 Cloudflare）把我們的請求當成機器人
    擋下來，回傳的其實是一個「驗證頁」而不是官網真正的 404 頁。這兩種情況
    修法完全不同（前者要改網址，後者要調整 headers／改變爬取方式），
    附上回應標頭跟內容片段才分得出來是哪一種。
    """
    interesting_headers = ["server", "cf-ray", "cf-cache-status", "content-type", "x-cache"]
    header_lines = [
        f"  {h}: {resp.headers[h]}" for h in interesting_headers if h in resp.headers
    ]
    body_snippet = resp.text[:800] if resp.text else "(空)"
    return (
        "回應標頭：\n" + ("\n".join(header_lines) if header_lines else "  (無特別標頭)") + "\n"
        f"回應內容片段：\n{body_snippet}"
    )


def _request(url: str, *, params: dict | None) -> requests.Response:
    host = requests.utils.urlparse(url).netloc
    _throttle(host)
    try:
        return requests.get(
            url,
            params=params,
            headers=REQUEST_HEADERS,
            timeout=REQUEST_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise FetchError(f"無法連線到 {url}: {exc}") from exc


def get_rendered_html(
    url: str,
    *,
    wait_selector: str | None = None,
    timeout_ms: int = 20000,
) -> str:
    """用真的瀏覽器（Playwright + headless Chromium）載入網頁後回傳渲染完的 HTML。

    給 requests 抓不到資料的頁面用——例如賽程頁其實是 Vue.js 的單頁應用，
    伺服器回來的原始 HTML 只有篩選用的下拉選單，實際賽程卡片是瀏覽器執行
    JavaScript 之後才動態塞進 DOM，用 requests 永遠只會看到空殼。

    Args:
        wait_selector: 若提供，會等到頁面上出現符合這個 CSS selector 的元素
            才回傳（避免內容還沒渲染完就把 HTML 截走）；不提供則只等到
            網路閒置（"networkidle"）。
        timeout_ms: 等待逾時時間（毫秒）。

    Raises:
        FetchError: 瀏覽器啟動失敗、頁面載入逾時等問題。
    """
    def _run(page):
        _goto_with_www_fallback(page, url, timeout_ms=timeout_ms)
        if wait_selector:
            page.wait_for_selector(wait_selector, timeout=timeout_ms)
        return page.content()

    return _with_rendered_page(url, _run, timeout_ms=timeout_ms)


def get_rendered_html_after_selecting(
    url: str,
    *,
    option_text: str,
    timeout_ms: int = 20000,
) -> str:
    """載入網頁後，切換到某個分頁／篩選選項，再回傳切換後的渲染結果。

    用於「打者/投手/守備」這種同一個網址、用 Vue 前端在畫面上切換分頁的頁面
    ——切換分頁不會改變網址，用一般 requests 永遠只會拿到預設分頁（通常是
    打者）的資料。這裡會先找頁面上有沒有 <select> 選單裡有一個選項文字
    等於 option_text（原生下拉選單要用 select_option，直接點擊 <option>
    在瀏覽器自動化裡不可靠），找不到的話再退而求其次，找畫面上文字等於
    option_text 的可點擊元素直接點下去（分頁式 tab 常見的做法）。

    Args:
        option_text: 要切換過去的分頁/選項文字，例如「投手」。

    Raises:
        FetchError: 瀏覽器啟動失敗、頁面載入逾時、或完全找不到符合的
            切換元素。
    """

    def _run(page):
        _goto_with_www_fallback(page, url, timeout_ms=timeout_ms)

        selected = False
        selects = page.locator("select")
        for i in range(selects.count()):
            sel = selects.nth(i)
            option_texts = [t.strip() for t in sel.locator("option").all_inner_texts()]
            if option_text in option_texts:
                sel.select_option(label=option_text)
                selected = True
                break

        if not selected:
            candidate = page.get_by_text(option_text, exact=True).first
            candidate.click(timeout=timeout_ms)

        page.wait_for_load_state("networkidle", timeout=timeout_ms)
        return page.content()

    return _with_rendered_page(url, _run, timeout_ms=timeout_ms)


def _goto_with_www_fallback(page, url: str, *, timeout_ms: int) -> None:
    """瀏覽器導航到網址，跟 get_html() 一樣：404 的話自動改試「有無 www.」
    的另一個變體。

    Playwright 用真的瀏覽器渲染頁面，跟 get_html() 走的是完全不同的
    程式碼路徑，這裡要重做一次一樣的 www / 非 www 容錯，不然只有靜態
    HTTP 請求那條路徑會自動修正網址、瀏覽器渲染這條路徑遇到官網 www/非 www
    其中一個 404 時還是會直接失敗。
    """
    response = page.goto(url, wait_until="networkidle", timeout=timeout_ms)
    if response is not None and response.status == 404:
        alt_url = _swap_www(url)
        alt_response = page.goto(alt_url, wait_until="networkidle", timeout=timeout_ms)
        if alt_response is not None and alt_response.status == 200:
            return
        raise FetchError(
            f"{url}（狀態碼 404）與 {alt_url}"
            f"（狀態碼 {alt_response.status if alt_response is not None else '無回應'}）都連不上。"
        )
    if response is not None and response.status != 200:
        raise FetchError(f"{url} 回傳狀態碼 {response.status}")


def _with_rendered_page(url: str, run, *, timeout_ms: int) -> str:
    host = requests.utils.urlparse(url).netloc
    _throttle(host)
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise FetchError(
            "需要安裝 playwright 才能抓取這個頁面（pip install playwright && "
            "playwright install chromium）。"
        ) from exc

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            try:
                page = browser.new_page(user_agent=REQUEST_HEADERS.get("User-Agent"))
                return run(page)
            finally:
                browser.close()
    except Exception as exc:  # noqa: BLE001 - playwright 例外型別繁多，統一轉成 FetchError
        raise FetchError(f"用瀏覽器載入 {url} 失敗：{exc}") from exc
