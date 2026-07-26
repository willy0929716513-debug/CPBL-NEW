"""測試 get_rendered_html() 在 playwright 沒裝好時，能給出清楚的錯誤訊息。

真的啟動瀏覽器渲染頁面這件事，依賴「本機/CI 環境有沒有裝好對應版本的
Chromium」，不適合放進一般的快速 pytest 套件（會變慢、環境依賴、容易
在不同機器上得到不一致的結果）。這裡改成驗證「找不到 playwright 套件時」
的錯誤處理路徑本身是對的；瀏覽器真的渲染出正確 DOM 這件事，已經在開發
時手動驗證過（用一個內嵌 JS 修改 DOM 的 data: URL 測試，確認
page.content() 回傳的是 JS 執行後的結果，不是原始 HTML）。
"""
from __future__ import annotations

import builtins
from unittest.mock import Mock

import pytest

from cpbl_analytics.scraper.http import FetchError, _goto_with_www_fallback, get_rendered_html


def test_get_rendered_html_raises_clear_error_when_playwright_missing(monkeypatch):
    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "playwright.sync_api" or name.startswith("playwright"):
            raise ImportError("simulated: playwright not installed")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    with pytest.raises(FetchError, match="playwright"):
        get_rendered_html("https://example.com")


def _fake_response(status: int) -> Mock:
    resp = Mock()
    resp.status = status
    return resp


def test_goto_with_www_fallback_succeeds_on_first_try():
    page = Mock()
    page.goto.return_value = _fake_response(200)

    _goto_with_www_fallback(page, "https://www.cpbl.com.tw/schedule", timeout_ms=1000)

    assert page.goto.call_count == 1


def test_goto_with_www_fallback_retries_non_www_on_404():
    page = Mock()
    page.goto.side_effect = [_fake_response(404), _fake_response(200)]

    _goto_with_www_fallback(page, "https://www.cpbl.com.tw/schedule", timeout_ms=1000)

    assert page.goto.call_count == 2
    called_urls = [call.args[0] for call in page.goto.call_args_list]
    assert called_urls == [
        "https://www.cpbl.com.tw/schedule",
        "https://cpbl.com.tw/schedule",
    ]


def test_goto_with_www_fallback_raises_when_both_variants_fail():
    page = Mock()
    page.goto.side_effect = [_fake_response(404), _fake_response(404)]

    with pytest.raises(FetchError):
        _goto_with_www_fallback(page, "https://www.cpbl.com.tw/schedule", timeout_ms=1000)
