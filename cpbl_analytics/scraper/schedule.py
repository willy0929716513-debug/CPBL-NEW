"""賽程與戰報 scraper。

官網賽程頁面通常是「一日一組卡片」而不是單一大表格，跟 standings/batting/
pitching 用的表格式解析不同，所以這裡不套用 parse_table，而是走卡片式的
CSS selector 解析。這個頁面的版面在各球季改版機率最高，若解析失敗，
請先用瀏覽器「檢視原始碼」確認目前卡片的 class 名稱，更新下面的
GAME_CARD_SELECTOR 等常數。
"""
from __future__ import annotations

from dataclasses import dataclass

from bs4 import BeautifulSoup

from cpbl_analytics.config import URLS
from cpbl_analytics.scraper.http import ParsingError, get_html

GAME_CARD_SELECTOR = ".game, .schedule_game, li.game"
DATE_SELECTOR = ".date, .game_date"
TEAM_SELECTOR = ".team_name, .name"
SCORE_SELECTOR = ".score, .team_score"
STATUS_SELECTOR = ".state, .status"
VENUE_SELECTOR = ".place, .venue"


@dataclass
class GameResult:
    date: str
    away_team: str
    home_team: str
    away_score: int | None
    home_score: int | None
    status: str
    venue: str | None = None

    @property
    def is_final(self) -> bool:
        return self.away_score is not None and self.home_score is not None


def fetch_schedule(*, html: str | None = None) -> list[GameResult]:
    if html is None:
        html = get_html(URLS["schedule"])

    soup = BeautifulSoup(html, "lxml")
    cards = soup.select(GAME_CARD_SELECTOR)
    if not cards:
        raise ParsingError(
            f"找不到任何賽程卡片（selector={GAME_CARD_SELECTOR!r}）。"
            "官網賽程頁版面可能已改版，請更新 schedule.py 裡的 selector 常數。"
        )

    games: list[GameResult] = []
    for card in cards:
        date_el = card.select_one(DATE_SELECTOR)
        team_els = card.select(TEAM_SELECTOR)
        score_els = card.select(SCORE_SELECTOR)
        status_el = card.select_one(STATUS_SELECTOR)
        venue_el = card.select_one(VENUE_SELECTOR)

        if len(team_els) < 2:
            # 略過非比賽卡片（例如廣告、休兵日提示）
            continue

        away_score = int(score_els[0].get_text(strip=True)) if len(score_els) > 0 and score_els[0].get_text(strip=True).isdigit() else None
        home_score = int(score_els[1].get_text(strip=True)) if len(score_els) > 1 and score_els[1].get_text(strip=True).isdigit() else None

        games.append(
            GameResult(
                date=date_el.get_text(strip=True) if date_el else "",
                away_team=team_els[0].get_text(strip=True),
                home_team=team_els[1].get_text(strip=True),
                away_score=away_score,
                home_score=home_score,
                status=status_el.get_text(strip=True) if status_el else "",
                venue=venue_el.get_text(strip=True) if venue_el else None,
            )
        )

    if not games:
        raise ParsingError("解析出的賽程清單為空。")

    return games
