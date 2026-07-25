"""測試各 scraper 能否正確解析（用離線 fixture，不連外部網站）。

為什麼用 fixture 而不是真的打到官網：
這支程式在某些執行環境（例如本專案目前開發用的沙盒）沒有對外網路權限，
所以用人工設計、但欄位邏輯完全自洽的模擬 HTML，來驗證「parser 邏輯」跟
「驗證公式」本身是正確的。之後在有網路的環境第一次對官網實際跑爬蟲時，
務必先看 `資料驗證` 頁面／`scripts/run_scrape.py` 的輸出，確認驗證全部通過，
再放心使用抓到的資料。
"""
from __future__ import annotations

from pathlib import Path

import pytest

from cpbl_analytics.scraper.batting import fetch_batting_stats
from cpbl_analytics.scraper.http import ParsingError
from cpbl_analytics.scraper.pitching import fetch_pitching_stats, parse_innings_to_outs
from cpbl_analytics.scraper.standings import fetch_standings

FIXTURES = Path(__file__).parent / "fixtures"


def _read(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def test_fetch_standings_parses_all_teams():
    standings = fetch_standings(html=_read("standings_sample.html"))
    assert len(standings) == 6
    assert standings[0].team_name == "中信兄弟"
    assert standings[0].wins == 62
    assert standings[0].losses == 38
    assert standings[0].win_pct == pytest.approx(0.620, abs=1e-3)


def test_fetch_standings_raises_on_missing_required_column():
    with pytest.raises(ParsingError):
        fetch_standings(html=_read("standings_missing_column.html"))


def test_fetch_batting_stats_parses_players():
    stats = fetch_batting_stats(html=_read("batting_sample.html"))
    assert len(stats) == 3
    wang = next(s for s in stats if s.player_name == "王大明")
    assert wang.at_bats == 400
    assert wang.hits == 120
    assert wang.avg == pytest.approx(0.300, abs=1e-3)
    assert wang.home_runs == 15


def test_fetch_pitching_stats_parses_pitchers():
    stats = fetch_pitching_stats(html=_read("pitching_sample.html"))
    assert len(stats) == 2
    zhang = next(s for s in stats if s.player_name == "張投手")
    # 150.2 代表 150 又 2/3 局 -> 452 個出局數，不是 150.2*3
    assert zhang.innings_pitched_outs == 150 * 3 + 2
    assert zhang.innings_pitched_display == "150.2"
    assert zhang.innings_pitched_float == pytest.approx(150 + 2 / 3, abs=1e-3)


@pytest.mark.parametrize(
    "raw, expected_outs",
    [
        ("0", 0),
        ("5", 15),
        ("5.1", 16),
        ("5.2", 17),
        ("", 0),
        ("-", 0),
    ],
)
def test_parse_innings_to_outs(raw: str, expected_outs: int):
    assert parse_innings_to_outs(raw) == expected_outs


def test_parse_innings_to_outs_rejects_invalid_fraction():
    with pytest.raises(ParsingError):
        parse_innings_to_outs("5.5")
