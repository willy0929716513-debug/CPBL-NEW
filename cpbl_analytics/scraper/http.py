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


@retry(
    reraise=True,
    stop=stop_after_attempt(MAX_RETRIES),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type(FetchError),
)
def get_html(url: str, *, params: dict | None = None) -> str:
    """抓取一個網頁的 HTML 原始碼，含節流與重試。

    Raises:
        FetchError: 連線失敗或回傳非 2xx 狀態碼（重試 MAX_RETRIES 次後仍失敗）。
    """
    host = requests.utils.urlparse(url).netloc
    _throttle(host)
    try:
        resp = requests.get(
            url,
            params=params,
            headers=REQUEST_HEADERS,
            timeout=REQUEST_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise FetchError(f"無法連線到 {url}: {exc}") from exc

    if resp.status_code != 200:
        raise FetchError(f"{url} 回傳狀態碼 {resp.status_code}")

    resp.encoding = resp.apparent_encoding or "utf-8"
    return resp.text
