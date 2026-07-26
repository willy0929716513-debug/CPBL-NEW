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

from cpbl_analytics.scraper.http import (
    FetchError,
    _goto_with_www_fallback,
    _select_and_verify,
    _try_click_by_text,
    _try_select_option,
    get_rendered_html,
)


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


def _fake_select(option_texts: list[str]) -> Mock:
    select = Mock()
    option_locator = Mock()
    option_locator.all_inner_texts.return_value = option_texts
    select.locator.return_value = option_locator
    return select


def test_try_select_option_finds_matching_option_and_selects_it():
    page = Mock()
    matching_select = _fake_select(["打者", "投手", "守備"])
    selects = Mock()
    selects.count.return_value = 1
    selects.nth.return_value = matching_select
    page.locator.return_value = selects

    assert _try_select_option(page, "投手") is True
    matching_select.select_option.assert_called_once_with(label="投手")


def test_try_select_option_returns_false_when_no_select_matches():
    page = Mock()
    non_matching_select = _fake_select(["2024", "2025", "2026"])
    selects = Mock()
    selects.count.return_value = 1
    selects.nth.return_value = non_matching_select
    page.locator.return_value = selects

    assert _try_select_option(page, "投手") is False


def test_try_select_option_falls_back_to_substring_match():
    # 官網下拉選單裡實際顯示的文字是「投手成績」，不是單純的「投手」——
    # 這是修這支程式的真正原因，一定要涵蓋這個情境。
    page = Mock()
    select = _fake_select(["打者成績", "投手成績", "守備成績"])
    selects = Mock()
    selects.count.return_value = 1
    selects.nth.return_value = select
    page.locator.return_value = selects

    assert _try_select_option(page, "投手") is True
    select.select_option.assert_called_once_with(label="投手成績")


def test_try_click_by_text_skips_click_when_locator_finds_nothing():
    # 這是修這支程式的關鍵原因：locator 完全沒找到符合的元素時，
    # click() 預設會一直等到逾時，而不是馬上失敗。用 count() 先檔掉，
    # 才不會把整個逾時預算耗在一個註定失敗的策略上。
    page = Mock()
    locator = Mock()
    locator.count.return_value = 0
    page.get_by_text.return_value.first = locator

    assert _try_click_by_text(page, "投手", exact=True) is False
    locator.click.assert_not_called()


def test_try_click_by_text_clicks_when_locator_finds_something():
    page = Mock()
    locator = Mock()
    locator.count.return_value = 1
    page.get_by_text.return_value.first = locator

    assert _try_click_by_text(page, "投手", exact=True) is True
    locator.click.assert_called_once()


def _page_with_selectable_option(option_texts: list[str]) -> Mock:
    """回傳一個 page mock，其 <select> 選單能被 _try_select_option 選中。"""
    page = Mock()
    select = _fake_select(option_texts)
    selects = Mock()
    selects.count.return_value = 1
    selects.nth.return_value = select
    page.locator.return_value = selects
    return page


def test_select_and_verify_returns_content_immediately_when_no_verification_needed():
    page = _page_with_selectable_option(["打者成績", "投手成績"])
    page.content.return_value = "<html>投手資料</html>"

    result = _select_and_verify(
        page, url="https://example.com", option_text="投手成績",
        verify_text_absent=None, timeout_ms=1000,
    )

    assert result == "<html>投手資料</html>"


def test_select_and_verify_clicks_query_button_when_switch_did_not_take_effect():
    # 選完選項後畫面第一次還是舊內容（仍有「打擊率」），程式應該再多按一次
    # 「查詢」按鈕，第二次拿到的內容才是真的切換後的結果。
    page = _page_with_selectable_option(["打者成績", "投手成績"])
    page.content.side_effect = ["<html>打擊率...(舊內容)</html>", "<html>防禦率...(新內容)</html>"]

    query_button = Mock()
    query_button.count.return_value = 1
    page.get_by_text.return_value.first = query_button

    result = _select_and_verify(
        page, url="https://example.com", option_text="投手成績",
        verify_text_absent="打擊率", timeout_ms=1000,
    )

    assert result == "<html>防禦率...(新內容)</html>"
    query_button.click.assert_called_once()


def test_select_and_verify_raises_when_stale_content_never_changes():
    page = _page_with_selectable_option(["打者成績", "投手成績"])
    page.content.return_value = "<html>打擊率...(還是舊內容)</html>"

    no_button = Mock()
    no_button.count.return_value = 0
    page.get_by_text.return_value.first = no_button

    with pytest.raises(FetchError, match="打擊率"):
        _select_and_verify(
            page, url="https://example.com", option_text="投手成績",
            verify_text_absent="打擊率", timeout_ms=1000,
        )
