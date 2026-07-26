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
    verify_text_absent: str | None = None,
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
        option_text: 要切換過去的分頁/選項文字，例如「投手成績」。
        verify_text_absent: 選填。切換「前」畫面上會有、切換「成功後」應該
            消失的文字（例如打者表特有的表頭「打擊率」）。有些頁面選完
            下拉選單選項後，還需要另外按「查詢」/「搜尋」按鈕才會真的重新
            查詢，光呼叫 select_option() 不會觸發——提供這個參數，才能在
            切換看起來「有做但沒有真的生效」時，自動再多試一步按查詢按鈕，
            而不是安靜地把切換前的舊內容當成新內容回傳。

    Raises:
        FetchError: 瀏覽器啟動失敗、頁面載入逾時、完全找不到符合的切換元素、
            或（提供 verify_text_absent 時）切換後畫面內容看起來仍是切換前
            的樣子。
    """

    def _run(page):
        _goto_with_www_fallback(page, url, timeout_ms=timeout_ms)
        return _select_and_verify(
            page,
            url=url,
            option_text=option_text,
            verify_text_absent=verify_text_absent,
            timeout_ms=timeout_ms,
        )

    return _with_rendered_page(url, _run, timeout_ms=timeout_ms)


def _truncate(text: str, *, limit: int = 4000) -> str:
    if len(text) > limit:
        return text[:limit] + f"...(截斷，完整長度 {len(text)} 字元)"
    return text


def _diagnostic_body_snippet(html: str, *, limit: int = 6000) -> str:
    """把整頁 HTML 裡的 <head>／<script>／<style>／註解拿掉，只留 <body> 內容再截斷。

    像 CPBL 官網這種傳統 ASP.NET + 一堆 CSS/JS 掛件（Google Tag Manager、
    選單套件...）的頁面，光 <head> 就可能好幾千字元，如果直接對整份原始
    HTML 做字元截斷，錯誤訊息裡塞的全是追蹤碼、樣式表連結，實際需要看的
    表單／下拉選單／表格內容反而被擠到截斷範圍外面，完全看不到。
    """
    from bs4 import BeautifulSoup, Comment

    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "link", "noscript", "meta"]):
        tag.decompose()
    for comment in soup.find_all(string=lambda s: isinstance(s, Comment)):
        comment.extract()
    body = soup.find("body")
    raw = str(body) if body is not None else str(soup)
    return _truncate(raw, limit=limit)


def _select_and_verify(
    page,
    *,
    url: str,
    option_text: str,
    verify_text_absent: str | None,
    timeout_ms: int,
) -> str:
    """實際執行「切換分頁/選項 -> 視需要再多按查詢按鈕 -> 回傳結果」的邏輯。

    拆成獨立函式（不像其他 Playwright 邏輯包在閉包裡），是為了可以直接餵
    假的 page 物件做單元測試，不用每次都真的啟動瀏覽器。
    """
    switched = (
        _try_select_option(page, option_text)
        or _try_click_by_text(page, option_text, exact=True)
        or _try_click_by_text(page, option_text, exact=False)
    )
    if not switched:
        content = page.content()
        raise FetchError(
            f"在 {url} 上找不到任何可以切換到「{option_text}」的下拉選單選項，"
            "也找不到文字等於或包含這個字的可點擊元素。\n"
            f"頁面渲染後的 HTML（截斷）：\n{_diagnostic_body_snippet(content)}"
        )

    page.wait_for_load_state("networkidle", timeout=timeout_ms)
    content = page.content()

    if verify_text_absent is not None and verify_text_absent in content:
        # 切換動作執行了，但畫面看起來還是切換前的樣子——常見原因是
        # 這種查詢頁面選完選項後還需要手動按「查詢/搜尋」才會真的送出，
        # 這裡多嘗試一步，而不是直接把舊內容當新內容回傳。
        #
        # 優先找真正的 <button>（語意上比較可能是送出動作），文字比對
        # 找到的東西很容易誤中網頁上其他剛好包含「查詢」兩個字的連結
        # （例如麵包屑導覽「全記錄查詢」），那種元素通常本來就點不了、
        # 點了也不會有作用。
        (
            _try_click_button_by_text(page, ["查詢", "搜尋", "送出", "Search"])
            or _try_click_by_text(page, "查詢", exact=False)
            or _try_click_by_text(page, "搜尋", exact=False)
            or _try_click_by_text(page, "送出", exact=False)
        )
        page.wait_for_load_state("networkidle", timeout=timeout_ms)
        content = page.content()

        if verify_text_absent in content:
            raise FetchError(
                f"已嘗試切換到「{option_text}」（也試過點擊查詢/搜尋按鈕），"
                f"但畫面內容看起來仍然是切換前的樣子（仍然包含"
                f"「{verify_text_absent}」）。可能這個下拉選單不是實際控制"
                "這份資料的開關，或是還需要別的步驟才會真的重新查詢。\n"
                f"頁面渲染後的 HTML（截斷）：\n{_diagnostic_body_snippet(content)}"
            )

    return content


def _try_select_option(page, option_text: str) -> bool:
    """找頁面上是不是有 <select> 選單裡有一個選項文字符合 option_text，有的話選取它。

    先找「完全相等」的選項，找不到才退而求其次找「選項文字包含 option_text」
    的——官網下拉選單的實際文字不一定就是我們要找的那個詞本身，例如
    「投手」這個概念，選單裡實際顯示的是「投手成績」。
    """
    selects = page.locator("select")
    for i in range(selects.count()):
        sel = selects.nth(i)
        option_texts = [t.strip() for t in sel.locator("option").all_inner_texts()]
        if option_text in option_texts:
            sel.select_option(label=option_text)
            return True
    for i in range(selects.count()):
        sel = selects.nth(i)
        option_texts = [t.strip() for t in sel.locator("option").all_inner_texts()]
        match = next((t for t in option_texts if option_text in t), None)
        if match is not None:
            sel.select_option(label=match)
            return True
    return False


def _try_click_by_text(page, option_text: str, *, exact: bool) -> bool:
    """找畫面上文字等於（或包含）option_text 的可點擊元素並點下去。

    先用 count() 確認真的有找到元素才點擊，而不是直接呼叫 click()——locator
    在目前頁面上完全沒有符合的元素時，click() 預設行為是「一直等到超時」，
    這樣三種策略（select、精確文字、模糊文字）疊在一起試，很容易單一個策略
    就把整個逾時預算耗光，導致明明第三種策略可能秒選到，卻永遠等不到那一步。

    找到元素、但實際點擊失敗（例如模糊比對抓到一個不相關、看起來不可點擊
    的元素，像是麵包屑導覽列裡剛好包含這幾個字的連結）也視為「這個策略沒用」
    回傳 False，而不是讓例外整個往上炸——不然後面「搜尋」「送出」這些備用
    策略、以及最後那個帶著完整診斷資訊的錯誤訊息，都永遠沒有機會執行到。
    """
    locator = page.get_by_text(option_text, exact=exact).first
    if locator.count() == 0:
        return False
    try:
        locator.click(timeout=3000)
    except Exception:  # noqa: BLE001 - 點擊失敗一律當成「這個策略沒用」，換下一個試
        return False
    return True


def _try_click_button_by_text(page, texts: list[str]) -> bool:
    """在真正的 <button> 元素裡找文字包含 texts 其中之一的，找到就點下去。

    比起「頁面上任何文字等於 XXX 的元素」，限定在 <button> 標籤裡找更精準
    ——像麵包屑導覽「全記錄查詢」這種連結，文字上會誤中「查詢」兩個字，
    但語意上根本不是一個表單送出按鈕。
    """
    for text in texts:
        locator = page.locator("button", has_text=text).first
        if locator.count() == 0:
            continue
        try:
            locator.click(timeout=3000)
        except Exception:  # noqa: BLE001 - 點擊失敗一律當成「這個按鈕沒用」，換下一個文字試
            continue
        return True
    return False


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
