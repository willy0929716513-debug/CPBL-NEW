"""投手「全記錄查詢」scraper：抓取球員完整季度投球數據。"""
from __future__ import annotations

from dataclasses import dataclass

from cpbl_analytics.config import URLS
from cpbl_analytics.scraper.http import ParsingError, get_html
from cpbl_analytics.scraper.parsing_utils import ColumnSpec, parse_table, to_float, to_int

TABLE_SELECTOR = "table.RecordTable, table.record_table, table"

COLUMNS = [
    ColumnSpec(("排名",), "rank", required=False),
    ColumnSpec(("球員", "選手", "姓名"), "player_name"),
    ColumnSpec(("球隊", "隊伍"), "team_name"),
    ColumnSpec(("出賽數", "出賽"), "games"),
    ColumnSpec(("先發", "GS"), "games_started", required=False),
    ColumnSpec(("完投", "CG"), "complete_games", required=False),
    ColumnSpec(("完封", "SHO"), "shutouts", required=False),
    ColumnSpec(("勝投", "勝", "W"), "wins"),
    ColumnSpec(("敗投", "敗", "L"), "losses"),
    ColumnSpec(("救援成功", "救援", "SV"), "saves", required=False),
    ColumnSpec(("中繼", "HLD"), "holds", required=False),
    ColumnSpec(("投球局數", "局數", "IP"), "innings_pitched_raw"),
    ColumnSpec(("被安打", "安打", "H"), "hits_allowed", required=False),
    ColumnSpec(("被全壘打", "全壘打", "HR"), "home_runs_allowed", required=False),
    ColumnSpec(("四壞球", "四壞", "BB"), "walks", required=False),
    ColumnSpec(("故意四壞", "敬遠", "IBB"), "intentional_walks", required=False),
    ColumnSpec(("死球", "觸身球", "HBP"), "hit_by_pitch", required=False),
    ColumnSpec(("三振", "SO"), "strikeouts", required=False),
    ColumnSpec(("暴投", "WP"), "wild_pitches", required=False),
    ColumnSpec(("犯規", "balk", "BK"), "balks", required=False),
    ColumnSpec(("失分", "R"), "runs_allowed"),
    ColumnSpec(("自責分", "ER"), "earned_runs"),
    ColumnSpec(("防禦率", "ERA"), "era"),
    ColumnSpec(("WHIP",), "whip", required=False),
]


@dataclass
class PitchingStat:
    player_name: str
    team_name: str
    games: int
    wins: int
    losses: int
    saves: int
    holds: int
    innings_pitched_outs: int  # 用「出局數」內部儲存，避免 12.1 這種記號被誤當十進位小數
    hits_allowed: int
    home_runs_allowed: int
    walks: int
    intentional_walks: int
    hit_by_pitch: int
    strikeouts: int
    wild_pitches: int
    balks: int
    runs_allowed: int
    earned_runs: int
    era: float
    whip: float | None = None
    games_started: int = 0
    complete_games: int = 0
    shutouts: int = 0
    rank: int | None = None

    @property
    def innings_pitched_display(self) -> str:
        """轉回官網慣用的「12.1 = 12又1/3局」記號，只用來顯示。"""
        full = self.innings_pitched_outs // 3
        rem = self.innings_pitched_outs % 3
        return f"{full}.{rem}"

    @property
    def innings_pitched_float(self) -> float:
        """轉成真正的十進位局數（12又1/3局 = 12.333...），給計算用，不要拿來顯示。"""
        full = self.innings_pitched_outs // 3
        rem = self.innings_pitched_outs % 3
        return full + rem / 3


def parse_innings_to_outs(raw: str, *, field: str = "innings_pitched") -> int:
    """把官網的「局.出局數」記號（例如 "12.1" = 12局又1個出局數）轉成總出局數。

    這裡刻意不要用 float(raw) 直接算，因為 12.1 若當成十進位小數會變成
    12.1 局，跟正確答案 12又1/3=12.333 局差了 0.2 局，長局數球員 ERA/WHIP
    會整個算錯。
    """
    raw = raw.strip()
    if raw in ("", "-", "--"):
        return 0
    if "." in raw:
        whole_str, frac_str = raw.split(".", 1)
        whole = int(whole_str) if whole_str else 0
        frac = int(frac_str[0]) if frac_str else 0
        if frac not in (0, 1, 2):
            raise ParsingError(
                f"欄位「{field}」的值「{raw}」小數部分應為 0/1/2（代表出局數），實際是 {frac}"
            )
        return whole * 3 + frac
    return int(raw) * 3


def fetch_pitching_stats(*, html: str | None = None, year: int | None = None) -> list[PitchingStat]:
    if html is None:
        params = {"year": year} if year else None
        html = get_html(URLS["record_all"], params=params)

    rows = parse_table(html, table_selector=TABLE_SELECTOR, columns=COLUMNS)

    stats: list[PitchingStat] = []
    for row in rows:
        def gi(field: str) -> int:
            return to_int(row.get(field, "0"), field=field)

        def gf(field: str) -> float:
            return to_float(row.get(field, "0"), field=field)

        stats.append(
            PitchingStat(
                player_name=row["player_name"],
                team_name=row["team_name"],
                games=gi("games"),
                games_started=gi("games_started"),
                complete_games=gi("complete_games"),
                shutouts=gi("shutouts"),
                wins=gi("wins"),
                losses=gi("losses"),
                saves=gi("saves"),
                holds=gi("holds"),
                innings_pitched_outs=parse_innings_to_outs(row["innings_pitched_raw"]),
                hits_allowed=gi("hits_allowed"),
                home_runs_allowed=gi("home_runs_allowed"),
                walks=gi("walks"),
                intentional_walks=gi("intentional_walks"),
                hit_by_pitch=gi("hit_by_pitch"),
                strikeouts=gi("strikeouts"),
                wild_pitches=gi("wild_pitches"),
                balks=gi("balks"),
                runs_allowed=gi("runs_allowed"),
                earned_runs=gi("earned_runs"),
                era=gf("era"),
                whip=gf("whip") if row.get("whip") else None,
                rank=gi("rank") if row.get("rank") else None,
            )
        )

    if not stats:
        raise ParsingError("解析出的投手資料為空。")

    return stats
