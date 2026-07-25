"""球隊戰績（standings）scraper。

對應官網「本季球隊戰績」頁面（config.URLS["standings"]）。
"""
from __future__ import annotations

from dataclasses import dataclass

from cpbl_analytics.config import URLS
from cpbl_analytics.scraper.http import ParsingError, get_html
from cpbl_analytics.scraper.parsing_utils import ColumnSpec, parse_table, to_float, to_int

TABLE_SELECTOR = "table.standings_tb, table"

COLUMNS = [
    ColumnSpec(("排名", "名次"), "rank", required=False),
    ColumnSpec(("球隊", "隊伍", "Team"), "team_name"),
    ColumnSpec(("出賽數", "出賽", "已賽"), "games"),
    ColumnSpec(("勝", "勝場"), "wins"),
    ColumnSpec(("負", "敗場", "負場"), "losses"),
    ColumnSpec(("和", "和局", "平"), "ties", required=False),
    ColumnSpec(("勝率",), "win_pct"),
    ColumnSpec(("勝差", "GB"), "games_behind", required=False),
    ColumnSpec(("近十場", "近十戰"), "last_10", required=False),
    ColumnSpec(("連勝", "連勝(敗)", "連勝/敗"), "streak", required=False),
]


@dataclass
class TeamStanding:
    team_name: str
    games: int
    wins: int
    losses: int
    ties: int
    win_pct: float
    games_behind: str | None
    last_10: str | None
    streak: str | None
    rank: int | None = None

    @property
    def run_diff_available(self) -> bool:
        return False  # 目前官網戰績表沒有得失分欄位，見 record_all 的隊伍加總


def fetch_standings(*, html: str | None = None) -> list[TeamStanding]:
    """抓取並解析球隊戰績表。

    Args:
        html: 若提供則直接解析（測試/離線用），否則會發送 HTTP 請求到官網。
    """
    if html is None:
        html = get_html(URLS["standings"])

    rows = parse_table(html, table_selector=TABLE_SELECTOR, columns=COLUMNS)

    standings: list[TeamStanding] = []
    for i, row in enumerate(rows, start=1):
        wins = to_int(row["wins"], field="wins")
        losses = to_int(row["losses"], field="losses")
        ties = to_int(row.get("ties", "0"), field="ties")
        games = to_int(row.get("games", "0"), field="games") or (wins + losses + ties)

        win_pct_raw = row["win_pct"].replace("%", "")
        win_pct = to_float(win_pct_raw, field="win_pct")
        if win_pct > 1.0:  # 官網可能寫成 55.6 而不是 .556
            win_pct = win_pct / 100

        rank_raw = row.get("rank", "").strip()
        rank = to_int(rank_raw, field="rank") if rank_raw else i

        standings.append(
            TeamStanding(
                team_name=row["team_name"],
                games=games,
                wins=wins,
                losses=losses,
                ties=ties,
                win_pct=round(win_pct, 3),
                games_behind=row.get("games_behind") or None,
                last_10=row.get("last_10") or None,
                streak=row.get("streak") or None,
                rank=rank,
            )
        )

    if not standings:
        raise ParsingError("解析出的球隊戰績清單為空。")

    return standings
