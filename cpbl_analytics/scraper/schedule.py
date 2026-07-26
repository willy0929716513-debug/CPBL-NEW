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


def _diagnostic_html_snippet(soup: BeautifulSoup, *, limit: int = 4000) -> str:
    """找一個「看起來最可能是賽程區塊」的元素，回傳其原始 HTML（截斷）。

    優先找 class/id 名稱裡帶有 schedule/game/box 的元素（大概率就是我們要找
    的容器），找不到就退回整個 <body>。這樣錯誤訊息裡附的原始碼，能直接讓人
    比對出目前正確的 class 名稱該怎麼寫，不用再往返一次「你重跑一次工作流程、
    我再看 log」。
    """
    import re

    candidate = soup.find(
        attrs={"class": re.compile(r"schedule|game|box", re.IGNORECASE)}
    ) or soup.find(attrs={"id": re.compile(r"schedule|game|box", re.IGNORECASE)})
    target = candidate if candidate is not None else soup.find("body") or soup
    raw = str(target)
    if len(raw) > limit:
        return raw[:limit] + f"...(截斷，完整長度 {len(raw)} 字元)"
    return raw


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
            "官網賽程頁版面可能已改版，請更新 schedule.py 裡的 selector 常數。\n"
            f"頁面原始 HTML 片段（截斷，方便直接比對真實 class 名稱）：\n"
            f"{_diagnostic_html_snippet(soup)}"
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
